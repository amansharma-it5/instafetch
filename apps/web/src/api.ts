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
}

export interface ResolveData {
  sourceType: 'post' | 'reel' | 'tv' | 'story';
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

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function mediaUrl(path: string): string {
  return new URL(path, `${API_BASE_URL}/`).toString();
}

export async function resolveInstagram(url: string, signal?: AbortSignal): Promise<ResolveSuccess> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/instagram/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError('NETWORK_FAILURE', 'We could not reach the InstaFetch service. Try again shortly.');
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
