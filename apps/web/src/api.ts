export interface ResolveMediaItem {
  id: string;
  type: 'video' | 'photo';
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  thumbnail: string | null;
  previewUrl: string;
  downloadUrl?: string;
  durationSeconds?: number | null;
  hasAudio?: boolean;
  hasVideo?: boolean;
  container?: string;
}

export interface YouTubeDownloadOption {
  optionId: string;
  kind: 'video' | 'audio';
  format: string;
  resolution: number | null;
  width: number | null;
  height: number | null;
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  filesizeBytes: number | null;
  filesizeApproximate: boolean;
  sizeBytes: number | null;
  sizeKind: 'exact' | 'estimated' | 'unknown';
  qualityLabel: string;
  hasAudio: boolean;
  requiresMux: boolean;
  compatibilityLabel: string;
  bitrateKbps: number | null;
}

export interface ResolveData {
  platform?: 'instagram' | 'youtube';
  sourceType: 'post' | 'reel' | 'tv' | 'story' | 'youtube_video' | 'youtube_short';
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  isCarousel: boolean;
  itemCount?: number;
  resolvedItemCount?: number;
  partial?: boolean;
  warning?: string | null;
  items: ResolveMediaItem[];
  jobId?: string;
  durationSeconds?: number | null;
  previewUrl?: string | null;
  previewOptionId?: string | null;
  downloadOptions?: YouTubeDownloadOption[];
  audioOptions?: YouTubeDownloadOption[];
}

export interface ResolveSuccess {
  success: true;
  data: ResolveData;
}

export interface ResolveFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ResolveResponse = ResolveSuccess | ResolveFailure;

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const RESOLVE_TIMEOUT_MS = 120_000;

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function mediaUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

async function resolveAt(path: string, url: string, signal?: AbortSignal): Promise<ResolveSuccess> {
  let response: Response;
  const requestController = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, RESOLVE_TIMEOUT_MS);
  const abortRequest = () => requestController.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: requestController.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) {
      throw new ApiClientError('EXTRACTION_TIMEOUT', 'The public media check timed out. Please try again.');
    }
    throw new ApiClientError('NETWORK_FAILURE', 'We could not reach the InstaFetch service. Try again shortly.');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }

  let payload: ResolveResponse;
  try {
    payload = await response.json() as ResolveResponse;
  } catch {
    throw new ApiClientError('NETWORK_FAILURE', 'The service returned an unreadable response.', response.status);
  }
  if (!response.ok || !payload.success) {
    if (!payload.success) throw new ApiClientError(payload.error.code, payload.error.message, response.status);
    throw new ApiClientError('NETWORK_FAILURE', 'The service could not process that link.', response.status);
  }
  return payload;
}

export function resolveInstagram(url: string, signal?: AbortSignal): Promise<ResolveSuccess> {
  return resolveAt('/api/instagram/resolve', url, signal);
}

export function resolveYouTube(url: string, signal?: AbortSignal): Promise<ResolveSuccess> {
  return resolveAt('/api/youtube/resolve', url, signal);
}

export interface PrepareYouTubeOptionSuccess {
  success: true;
  data: { optionId: string; downloadUrl: string; extension: string; kind: 'video' | 'audio' };
}

export async function prepareYouTubeOption(jobId: string, optionId: string, signal?: AbortSignal): Promise<PrepareYouTubeOptionSuccess> {
  const response = await fetch(`${API_BASE_URL}/api/youtube/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, optionId }),
    signal,
  });
  let payload: PrepareYouTubeOptionSuccess | ResolveFailure;
  try {
    payload = await response.json() as PrepareYouTubeOptionSuccess | ResolveFailure;
  } catch {
    throw new ApiClientError('NETWORK_FAILURE', 'The service returned an unreadable response.', response.status);
  }
  if (!response.ok || !payload.success) {
    if (!payload.success) throw new ApiClientError(payload.error.code, payload.error.message, response.status);
    throw new ApiClientError('DOWNLOAD_FAILED', 'The service could not prepare that option.', response.status);
  }
  return payload;
}

export type EngineStatus = 'checking' | 'ready' | 'sleeping';

export async function checkEngineHealth(signal?: AbortSignal): Promise<EngineStatus> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  try {
    const response = await fetch(`${API_BASE_URL}/health/live`, { signal: controller.signal, cache: 'no-store' });
    return response.ok ? 'ready' : 'sleeping';
  } catch {
    return 'sleeping';
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}
