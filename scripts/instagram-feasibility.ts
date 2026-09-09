import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInstagramUrl } from '../packages/shared/src/instagram-url.ts';
import {
  buildYtDlpArgs,
  parseYtDlpJson,
  redactUrls,
  resolveYtDlpExecutable,
  runYtDlpMetadata,
  type YtDlpMetadata,
  type YtDlpProcessOptions,
} from '../apps/api/src/services/extraction/yt-dlp-process.ts';

export type YtDlpRunOptions = YtDlpProcessOptions;
export type { YtDlpMetadata };
export { buildYtDlpArgs, parseYtDlpJson, resolveYtDlpExecutable };

export interface FeasibilityReport {
  extractor: string;
  mediaType: 'video' | 'photo' | 'carousel/playlist' | 'unknown';
  title?: string;
  uploader?: string;
  thumbnailPresent: boolean;
  entryCount?: number;
  videoCandidateCount: number;
  imageCandidateCount: number;
}

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const VIDEO_EXTENSIONS = new Set(['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function entriesFor(metadata: YtDlpMetadata): Array<Record<string, unknown>> {
  const entries = recordArray(metadata.entries);
  return entries.length > 0 ? entries : [metadata];
}

function videoCandidateCount(item: Record<string, unknown>): number {
  return recordArray(item.formats).filter((format) => {
    const codec = typeof format.vcodec === 'string' ? format.vcodec.toLowerCase() : '';
    const extension = typeof format.ext === 'string' ? format.ext.toLowerCase() : '';
    return (codec.length > 0 && codec !== 'none') || VIDEO_EXTENSIONS.has(extension);
  }).length;
}

function imageCandidateCount(item: Record<string, unknown>): number {
  const formats = recordArray(item.formats).filter((format) => {
    const codec = typeof format.vcodec === 'string' ? format.vcodec.toLowerCase() : '';
    const extension = typeof format.ext === 'string' ? format.ext.toLowerCase() : '';
    return IMAGE_EXTENSIONS.has(extension) || (codec === 'none' && !VIDEO_EXTENSIONS.has(extension));
  }).length;
  const thumbnails = recordArray(item.thumbnails).filter((thumbnail) => typeof thumbnail.url === 'string').length;
  const singleThumbnail = typeof item.thumbnail === 'string' ? 1 : 0;
  return formats + thumbnails + singleThumbnail;
}

export async function runYtDlp(input: unknown, options: YtDlpRunOptions = {}): Promise<YtDlpMetadata> {
  const validated = parseInstagramUrl(input);
  return runYtDlpMetadata(validated.canonicalUrl, options);
}

export function summarizeMetadata(metadata: YtDlpMetadata): FeasibilityReport {
  const entries = entriesFor(metadata);
  const playlist = Array.isArray(metadata.entries) || metadata._type === 'playlist';
  const videoCandidates = entries.reduce((total, entry) => total + videoCandidateCount(entry), 0);
  const imageCandidates = entries.reduce((total, entry) => total + imageCandidateCount(entry), 0);
  const thumbnailPresent = entries.some(
    (entry) => typeof entry.thumbnail === 'string'
      || recordArray(entry.thumbnails).some((thumbnail) => typeof thumbnail.url === 'string'),
  );
  const explicitType = firstString(metadata.media_type, metadata.mediaType)?.toLowerCase();
  const mediaType = playlist
    ? 'carousel/playlist'
    : explicitType === 'video' || videoCandidates > 0
      ? 'video'
      : explicitType === 'photo' || imageCandidates > 0
        ? 'photo'
        : 'unknown';

  return {
    extractor: firstString(metadata.extractor_key, metadata.extractor, metadata.ie_key) ?? 'unknown',
    mediaType,
    title: firstString(metadata.title),
    uploader: firstString(metadata.uploader, metadata.channel, metadata.creator, metadata.uploader_id),
    thumbnailPresent,
    entryCount: playlist ? recordArray(metadata.entries).length : undefined,
    videoCandidateCount: videoCandidates,
    imageCandidateCount: imageCandidates,
  };
}

function printReport(report: FeasibilityReport): void {
  process.stdout.write(`extractor: ${report.extractor}\n`);
  process.stdout.write(`media type: ${report.mediaType}\n`);
  process.stdout.write(`title: ${report.title ?? '(unavailable)'}\n`);
  process.stdout.write(`uploader: ${report.uploader ?? '(unavailable)'}\n`);
  process.stdout.write(`thumbnail: ${report.thumbnailPresent ? 'present' : 'absent'}\n`);
  process.stdout.write(`entries: ${report.entryCount ?? '(not a playlist)'}\n`);
  process.stdout.write(`video candidates: ${report.videoCandidateCount}\n`);
  process.stdout.write(`image candidates: ${report.imageCandidateCount}\n`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length === 0) {
    process.stdout.write('READY_FOR_PUBLIC_INSTAGRAM_URL\n');
    return 2;
  }
  if (argv.length !== 1) {
    process.stderr.write('Usage: npm run instagram:feasibility -- "<instagram-url>"\n');
    return 2;
  }

  try {
    const metadata = await runYtDlp(argv[0]);
    printReport(summarizeMetadata(metadata));
    return 0;
  } catch (error) {
    process.stderr.write(`feasibility check failed: ${redactUrls(error instanceof Error ? error.message : String(error))}\n`);
    return 1;
  }
}

const currentFile = resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedFile === currentFile) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
