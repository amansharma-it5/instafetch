import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { Transform } from 'node:stream';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { pipeline } from 'node:stream/promises';
import { isIP } from 'node:net';
import type { InternalMediaItem } from '../extraction/normalize-instagram.js';
import {
  buildFfmpegRemuxArgs,
  buildFfmpegTranscodeArgs,
  MediaProcessError,
  resolveFfmpegExecutable,
  resolveFfprobeExecutable,
  runFfmpeg,
  runFfprobe,
  type MediaProcessOptions,
  type ProbedMediaStreams,
} from '../extraction/ffmpeg-process.js';

export type MaterializationFailureCode =
  | 'MEDIA_UNAVAILABLE'
  | 'MEDIA_TOO_LARGE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_INVALID_CONTENT'
  | 'DOWNLOAD_FAILED'
  | 'SERVER_BUSY';

export class MediaMaterializationError extends Error {
  constructor(public readonly code: MaterializationFailureCode, message: string) {
    super(message);
    this.name = 'MediaMaterializationError';
  }
}

export interface MaterializedMedia {
  path: string;
  contentType: 'video/mp4' | 'video/webm' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif';
  extension: string;
  byteLength: number;
  filename: string;
  expiresAt: number;
}

export interface UpstreamResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: NodeJS.ReadableStream;
}

export type RequestUpstream = (url: string, timeoutMs: number) => Promise<UpstreamResponse>;

export interface MediaMaterializerOptions {
  rootDir?: string;
  ttlMs?: number;
  timeoutMs?: number;
  /** Maximum wall-clock time for each upstream media stream. */
  downloadTimeoutMs?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxFilesPerResolution?: number;
  /** Maximum number of independent materialization/FFmpeg operations in flight. */
  maxConcurrent?: number;
  maxRedirects?: number;
  now?: () => number;
  requestUpstream?: RequestUpstream;
  allowedHosts?: (hostname: string) => boolean;
  ffmpegExecutable?: string;
  ffprobeExecutable?: string;
  runFfmpeg?: (args: string[], options: MediaProcessOptions) => Promise<void>;
  probeMedia?: (path: string, options: MediaProcessOptions) => Promise<ProbedMediaStreams>;
}

interface CachedMedia extends MaterializedMedia {
  resolutionId: string;
  mediaId: string;
}

const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000;
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_CONCURRENT = 2;

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (isIP(normalized) === 4) {
    const octets = normalized.split('.').map(Number);
    const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256) + octets[3];
    const inRange = (start: number, end: number) => value >= start && value <= end;
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || octets[0] === 169 && octets[1] === 254
      || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
      || octets[0] === 192 && octets[1] === 168
      || inRange(0x6440000, 0x647ffff)
      || inRange(0xc000000, 0xc0000ff)
      || inRange(0xc612000, 0xc613fff)
      || inRange(0xc633640, 0xc6336ff)
      || inRange(0xcb00700, 0xcb007ff)
      || octets[0] >= 224;
  }
  if (isIP(normalized) === 6) {
    if (normalized === '::' || normalized === '::1') {
      return true;
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8')
      || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
      || normalized.startsWith('ff') || normalized.startsWith('2001:db8')) {
      return true;
    }
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  return true;
}

function defaultAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'instagram.com'
    || host === 'www.instagram.com'
    || host === 'youtube.com'
    || host === 'www.youtube.com'
    || host === 'm.youtube.com'
    || host === 'youtu.be'
    || host.endsWith('.googlevideo.com')
    || host.endsWith('.youtube.com')
    || host.endsWith('.cdninstagram.com')
    || host.endsWith('.fbcdn.net')
    || host.endsWith('.fbsbx.com');
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream address is not public');
    }
    return { address: hostname, family: isIP(hostname) as 4 | 6 };
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream address could not be resolved');
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream address is not public');
  }
  // Prefer IPv4 on hosts where IPv6 is advertised but not routable (common on Windows dev machines).
  const address = [...addresses].sort((left, right) => Number(left.family === 6) - Number(right.family === 6))[0];
  return { address: address.address, family: address.family as 4 | 6 };
}

async function defaultRequestUpstream(url: string, timeoutMs: number): Promise<UpstreamResponse> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new MediaMaterializationError('DOWNLOAD_FAILED', 'Only HTTPS upstream media is supported');
  }
  const resolved = await resolvePublicAddress(parsed.hostname);
  return new Promise((resolve, reject) => {
    const request = httpsRequest(parsed, {
      method: 'GET',
      // Some provider-backed YouTube audio URLs reject a plain GET but allow
      // an open-ended range request. This still asks for the complete stream
      // while remaining compatible with CDNs that ignore Range.
      headers: {
        accept: 'video/mp4,image/avif,image/webp,image/png,image/jpeg,image/gif',
        range: 'bytes=0-',
      },
      servername: parsed.hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [{ address: resolved.address, family: resolved.family }]);
        } else {
          callback(null, resolved.address, resolved.family);
        }
      },
    }, (response: IncomingMessage) => {
      response.setTimeout(timeoutMs, () => {
        response.destroy(new MediaMaterializationError('UPSTREAM_TIMEOUT', 'The upstream media request timed out'));
      });
      resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: response,
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new MediaMaterializationError('UPSTREAM_TIMEOUT', 'The upstream media request timed out'));
    });
    request.once('error', (error) => {
      if (error instanceof MediaMaterializationError) {
        reject(error);
      } else {
        reject(new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream media request failed'));
      }
    });
    request.end();
  });
}

function contentTypeFor(kind: 'video' | 'webm' | 'jpeg' | 'png' | 'webp' | 'gif' | 'avif'): MaterializedMedia['contentType'] {
  return kind === 'video' ? 'video/mp4' : kind === 'webm' ? 'video/webm' : `image/${kind}` as MaterializedMedia['contentType'];
}

function detectKind(buffer: Buffer): 'video' | 'webm' | 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | null {
  if (buffer.length >= 12 && buffer.subarray(4, 12).toString('ascii') === 'ftypavif') return 'avif';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video';
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'gif';
  return null;
}

function isAudioContainer(buffer: Buffer): boolean {
  if (buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return true;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return true;
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
}

class BoundedCapture extends Transform {
  private readonly chunks: Buffer[] = [];
  private captured = 0;
  public bytes = 0;
  constructor(private readonly maxBytes: number, private readonly captureBytes = 64 * 1024) {
    super();
  }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error) => void): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new MediaMaterializationError('MEDIA_TOO_LARGE', 'The upstream media exceeds the size limit'));
      return;
    }
    if (this.captured < this.captureBytes) {
      const next = chunk.subarray(0, Math.min(chunk.length, this.captureBytes - this.captured));
      this.chunks.push(next);
      this.captured += next.length;
    }
    this.push(chunk);
    callback();
  }
  get header(): Buffer { return Buffer.concat(this.chunks); }
}

export class MediaMaterializer {
  private readonly rootDir: string;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly downloadTimeoutMs: number;
  private readonly maxFileBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxFilesPerResolution: number;
  private readonly maxConcurrent: number;
  private readonly maxRedirects: number;
  private readonly now: () => number;
  private readonly requestUpstream: RequestUpstream;
  private readonly allowedHosts: (hostname: string) => boolean;
  private readonly ffmpegExecutable: string;
  private readonly ffprobeExecutable: string;
  private readonly runFfmpeg: (args: string[], options: MediaProcessOptions) => Promise<void>;
  private readonly probeMedia: (path: string, options: MediaProcessOptions) => Promise<ProbedMediaStreams>;
  private readonly cache = new Map<string, CachedMedia>();
  private readonly locks = new Map<string, Promise<MaterializedMedia>>();
  private readonly temporaryPaths = new Set<string>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private totalBytes = 0;
  private activeOperations = 0;

  constructor(options: MediaMaterializerOptions = {}) {
    this.rootDir = resolvePath(options.rootDir ?? join(tmpdir(), 'instafetch-media'));
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.maxFilesPerResolution = options.maxFilesPerResolution ?? 50;
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
      throw new Error('maxConcurrent must be a positive integer');
    }
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.now = options.now ?? Date.now;
    this.requestUpstream = options.requestUpstream ?? defaultRequestUpstream;
    this.allowedHosts = options.allowedHosts ?? defaultAllowedHost;
    this.ffmpegExecutable = options.ffmpegExecutable ?? resolveFfmpegExecutable();
    this.ffprobeExecutable = options.ffprobeExecutable ?? resolveFfprobeExecutable();
    this.runFfmpeg = options.runFfmpeg ?? ((args, processOptions) => runFfmpeg(args, { ...processOptions, executable: this.ffmpegExecutable }));
    this.probeMedia = options.probeMedia ?? ((path, processOptions) => runFfprobe(path, { ...processOptions, executable: this.ffprobeExecutable }));
    this.cleanupTimer = setInterval(() => { void this.cleanupExpired(); }, Math.min(this.ttlMs, 60_000));
    this.cleanupTimer.unref();
  }

  private assertSourceUrl(url: string): URL {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream media URL is invalid'); }
    if (parsed.protocol !== 'https:' || !this.allowedHosts(parsed.hostname)) {
      throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream media host is not allowed');
    }
    if (isIP(parsed.hostname) && isPrivateAddress(parsed.hostname)) {
      throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream address is not public');
    }
    return parsed;
  }

  private async requestFollowingRedirects(sourceUrl: string): Promise<UpstreamResponse> {
    let current = sourceUrl;
    for (let redirect = 0; redirect <= this.maxRedirects; redirect += 1) {
      const parsed = this.assertSourceUrl(current);
      const response = await this.requestUpstream(parsed.toString(), this.downloadTimeoutMs);
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirect === this.maxRedirects) {
          response.body.resume();
          throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream redirect limit was exceeded');
        }
        response.body.resume();
        current = new URL(response.headers.location, parsed).toString();
        continue;
      }
      return response;
    }
    throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream media request failed');
  }

  private async downloadToPath(
    sourceUrl: string,
    targetPath: string,
    expected: 'video' | 'audio' | 'image',
  ): Promise<{ bytes: number; kind: 'video' | 'webm' | 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | null }> {
    const source = this.assertSourceUrl(sourceUrl);
    const response = await this.requestFollowingRedirects(source.toString());
    if (response.statusCode === 404 || response.statusCode === 410) {
      response.body.resume();
      throw new MediaMaterializationError('MEDIA_UNAVAILABLE', 'The upstream media is unavailable');
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.body.resume();
      throw new MediaMaterializationError('DOWNLOAD_FAILED', 'The upstream media request failed');
    }
    const contentLength = Number(response.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > this.maxFileBytes) {
      response.body.resume();
      throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The upstream media exceeds the size limit');
    }

    this.temporaryPaths.add(targetPath);
    const capture = new BoundedCapture(this.maxFileBytes);
    const body = response.body as NodeJS.ReadableStream & { destroy?: (error?: Error) => void };
    const timeout = setTimeout(() => {
      body.destroy?.(new MediaMaterializationError('UPSTREAM_TIMEOUT', 'The upstream media request timed out'));
    }, this.downloadTimeoutMs);
    try {
      await pipeline(body, capture, createWriteStream(targetPath, { flags: 'wx' }));
      const kind = detectKind(capture.header);
      const valid = expected === 'audio'
        ? isAudioContainer(capture.header)
        : expected === 'video'
          ? kind === 'video' || kind === 'webm'
      : kind !== null && kind !== 'video' && kind !== 'webm';
      if (!valid) {
        throw new MediaMaterializationError('UPSTREAM_INVALID_CONTENT', 'The upstream response is not valid media');
      }
      return { bytes: capture.bytes, kind: expected === 'audio' ? null : kind };
    } catch (error) {
      await rm(targetPath, { force: true }).catch(() => undefined);
      throw error instanceof MediaMaterializationError
        ? error
        : new MediaMaterializationError('DOWNLOAD_FAILED', 'The media could not be downloaded');
    } finally {
      clearTimeout(timeout);
    }
  }

  private processError(error: unknown): MediaMaterializationError {
    if (error instanceof MediaProcessError) {
      if (error.kind === 'timeout') return new MediaMaterializationError('UPSTREAM_TIMEOUT', 'The media process timed out');
      if (error.kind === 'malformed') return new MediaMaterializationError('UPSTREAM_INVALID_CONTENT', 'The media metadata is invalid');
    }
    return new MediaMaterializationError('DOWNLOAD_FAILED', 'The media could not be materialized');
  }

  private async muxVideoAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    const processOptions: MediaProcessOptions = {
      executable: this.ffmpegExecutable,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: 128 * 1024,
    };
    try {
      await this.runFfmpeg(buildFfmpegRemuxArgs(videoPath, audioPath, outputPath), processOptions);
    } catch (error) {
      // VP9/AAC is normally safe to remux into MP4. If a provider/container
      // combination rejects stream copy, transcode once to browser-compatible
      // H.264/AAC rather than returning a silent or unplayable file.
      if (!(error instanceof MediaProcessError) || error.kind !== 'failed') throw this.processError(error);
      await rm(outputPath, { force: true }).catch(() => undefined);
      try {
        await this.runFfmpeg(buildFfmpegTranscodeArgs(videoPath, audioPath, outputPath), processOptions);
      } catch (fallbackError) {
        throw this.processError(fallbackError);
      }
    }
  }

  private async materializeWithAudio(resolutionId: string, item: InternalMediaItem, expiresAt: number): Promise<MaterializedMedia> {
    await mkdir(this.rootDir, { recursive: true });
    const stem = join(this.rootDir, `media-${resolutionId}-${item.id}-${Date.now()}`);
    const videoPath = `${stem}.video`;
    const audioPath = `${stem}.audio`;
    const outputPart = `${stem}.mp4.part`;
    const outputPath = `${stem}.mp4`;
    this.temporaryPaths.add(outputPart);
    this.temporaryPaths.add(outputPath);
    try {
      const video = await this.downloadToPath(item.providerUrl, videoPath, 'video');
      const audio = await this.downloadToPath(item.audioProviderUrl!, audioPath, 'audio');
      if (video.bytes + audio.bytes > this.maxTotalBytes) {
        throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The temporary media cache is full');
      }
      await this.muxVideoAudio(videoPath, audioPath, outputPart);
      let streams: ProbedMediaStreams;
      try {
        streams = await this.probeMedia(outputPart, {
          executable: this.ffprobeExecutable,
          timeoutMs: this.timeoutMs,
          maxOutputBytes: 128 * 1024,
        });
      } catch (error) {
        throw this.processError(error);
      }
      if (!streams.hasVideo || !streams.hasAudio) {
        throw new MediaMaterializationError('UPSTREAM_INVALID_CONTENT', 'The muxed media has no video and audio streams');
      }
      const outputBytes = await stat(outputPart).then((result) => result.size);
      if (outputBytes === 0 || outputBytes > this.maxFileBytes) {
        throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The materialized media exceeds the size limit');
      }
      await rename(outputPart, outputPath);
      // Re-check immediately after the rename. The synchronous cache update
      // below makes this aggregate limit safe when two operations finish at
      // the same time.
      const filesForResolution = [...this.cache.values()].filter((entry) => entry.resolutionId === resolutionId).length;
      if (filesForResolution >= this.maxFilesPerResolution || this.totalBytes + outputBytes > this.maxTotalBytes) {
        throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The materialized media exceeds the size limit');
      }
      this.temporaryPaths.delete(outputPart);
      await rm(videoPath, { force: true });
      await rm(audioPath, { force: true });
      this.temporaryPaths.delete(videoPath);
      this.temporaryPaths.delete(audioPath);
      const cached: CachedMedia = {
        resolutionId,
        mediaId: item.id,
        path: outputPath,
        contentType: 'video/mp4',
        extension: 'mp4',
        byteLength: outputBytes,
        filename: `instafetch-${item.id.slice(0, 12)}.mp4`,
        expiresAt: Math.min(expiresAt, this.now() + this.ttlMs),
      };
      this.cache.set(item.id, cached);
      this.totalBytes += cached.byteLength;
      this.temporaryPaths.delete(outputPath);
      return cached;
    } catch (error) {
      for (const path of [videoPath, audioPath, outputPart, outputPath]) {
        this.temporaryPaths.delete(path);
        await rm(path, { force: true }).catch(() => undefined);
      }
      throw error instanceof MediaMaterializationError
        ? error
        : new MediaMaterializationError('DOWNLOAD_FAILED', 'The media could not be materialized');
    }
  }

  private async materializeSingle(resolutionId: string, item: InternalMediaItem, expiresAt: number): Promise<MaterializedMedia> {
    await mkdir(this.rootDir, { recursive: true });
    const stem = join(this.rootDir, `media-${resolutionId}-${item.id}-${Date.now()}`);
    const tempPath = `${stem}.part`;
    const outputPath = stem;
    try {
      const downloaded = await this.downloadToPath(item.providerUrl, tempPath, item.type === 'video' ? 'video' : 'image');
      if (!downloaded.kind) {
        throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The temporary media cache is full');
      }
      if (item.type === 'video' && item.audioCodec) {
        let streams: ProbedMediaStreams;
        try {
          streams = await this.probeMedia(tempPath, {
            executable: this.ffprobeExecutable,
            timeoutMs: this.timeoutMs,
            maxOutputBytes: 128 * 1024,
          });
        } catch (error) {
          throw this.processError(error);
        }
        if (!streams.hasVideo || !streams.hasAudio) {
          throw new MediaMaterializationError('UPSTREAM_INVALID_CONTENT', 'The provider media has no video and audio streams');
        }
      }
      await rename(tempPath, outputPath);
      // Re-check after the asynchronous rename so concurrent operations cannot
      // both pass the aggregate cache limit based on the same stale total.
      const filesForResolution = [...this.cache.values()].filter((entry) => entry.resolutionId === resolutionId).length;
      if (filesForResolution >= this.maxFilesPerResolution || this.totalBytes + downloaded.bytes > this.maxTotalBytes) {
        throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'The temporary media cache is full');
      }
      this.temporaryPaths.delete(tempPath);
      const extension = downloaded.kind === 'video' ? 'mp4' : downloaded.kind === 'webm' ? 'webm' : downloaded.kind === 'jpeg' ? 'jpg' : downloaded.kind;
      const cached: CachedMedia = {
        resolutionId,
        mediaId: item.id,
        path: outputPath,
        contentType: contentTypeFor(downloaded.kind),
        extension,
        byteLength: downloaded.bytes,
        filename: `instafetch-${item.id.slice(0, 12)}.${extension}`,
        expiresAt: Math.min(expiresAt, this.now() + this.ttlMs),
      };
      this.cache.set(item.id, cached);
      this.totalBytes += cached.byteLength;
      return cached;
    } catch (error) {
      this.temporaryPaths.delete(tempPath);
      await rm(tempPath, { force: true }).catch(() => undefined);
      await rm(outputPath, { force: true }).catch(() => undefined);
      throw error instanceof MediaMaterializationError
        ? error
        : new MediaMaterializationError('DOWNLOAD_FAILED', 'The media could not be materialized');
    }
  }

  private async materializeFresh(resolutionId: string, item: InternalMediaItem, expiresAt: number): Promise<MaterializedMedia> {
    const existingForResolution = [...this.cache.values()].filter((entry) => entry.resolutionId === resolutionId).length;
    if (existingForResolution >= this.maxFilesPerResolution) {
      throw new MediaMaterializationError('MEDIA_TOO_LARGE', 'This resolution has reached its file limit');
    }
    if (item.type === 'video' && item.audioProviderUrl) {
      return this.materializeWithAudio(resolutionId, item, expiresAt);
    }
    return this.materializeSingle(resolutionId, item, expiresAt);
  }

  async materialize(resolutionId: string, item: InternalMediaItem, expiresAt: number): Promise<MaterializedMedia> {
    await this.cleanupExpired();
    const cached = this.cache.get(item.id);
    if (cached && cached.expiresAt > this.now()) {
      try { await access(cached.path); return cached; } catch { await this.removeCached(item.id); }
    }
    const pending = this.locks.get(item.id);
    if (pending) return pending;
    if (this.activeOperations >= this.maxConcurrent) {
      throw new MediaMaterializationError('SERVER_BUSY', 'The media service is at capacity');
    }
    this.activeOperations += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.activeOperations -= 1;
      }
    };
    const promise = (async () => {
      try {
        return await this.materializeFresh(resolutionId, item, expiresAt);
      } finally {
        release();
      }
    })();
    this.locks.set(item.id, promise);
    try { return await promise; } finally { this.locks.delete(item.id); }
  }

  async cleanupExpired(): Promise<void> {
    const current = this.now();
    for (const [mediaId, cached] of this.cache) {
      if (cached.expiresAt <= current) await this.removeCached(mediaId);
    }
  }

  async dispose(): Promise<void> {
    clearInterval(this.cleanupTimer);
    for (const mediaId of [...this.cache.keys()]) await this.removeCached(mediaId);
    for (const path of this.temporaryPaths) await rm(path, { force: true }).catch(() => undefined);
    this.temporaryPaths.clear();
  }

  cachedCount(): number { return this.cache.size; }
  cachedBytes(): number { return this.totalBytes; }
  activeOperationCount(): number { return this.activeOperations; }
  concurrencyLimit(): number { return this.maxConcurrent; }

  private async removeCached(mediaId: string): Promise<void> {
    const cached = this.cache.get(mediaId);
    if (!cached) return;
    this.cache.delete(mediaId);
    this.totalBytes -= cached.byteLength;
    await rm(cached.path, { force: true }).catch(() => undefined);
  }
}

export async function readMaterializedHead(media: MaterializedMedia, bytes = 16): Promise<Buffer> {
  const data = await readFile(media.path);
  return data.subarray(0, bytes);
}

export async function materializedStat(media: MaterializedMedia): Promise<number> {
  return (await stat(media.path)).size;
}
