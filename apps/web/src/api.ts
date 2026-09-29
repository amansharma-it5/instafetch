export interface ResolveMediaItem {
  id: string;
  type: 'video' | 'photo';
  width: number | null;
  height: number | null;
  extension: string;
  qualityLabel: string;
  thumbnail: string | null;
  previewUrl: string;
  downloadUrl: string;
  durationSeconds?: number | null;
  hasAudio?: boolean;
  hasVideo?: boolean;
  container?: string;
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
