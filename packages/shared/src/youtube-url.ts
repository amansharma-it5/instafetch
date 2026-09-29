export type YouTubeRoute = 'video' | 'short';

export interface ValidatedYouTubeUrl {
  platform: 'youtube';
  canonicalUrl: string;
  host: string;
  route: YouTubeRoute;
  identifier: string;
}

export type YouTubeUrlErrorCode = 'INVALID_YOUTUBE_URL' | 'PLAYLIST_NOT_SUPPORTED';

export class YouTubeUrlError extends Error {
  constructor(public readonly code: YouTubeUrlErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'YouTubeUrlError';
  }
}

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function trackingKey(key: string): boolean {
  return /^(utm_|si$|feature$|app$|pp$|fbclid$|gclid$)/i.test(key);
}

function identifier(value: string | null): string | null {
  return value && ID_PATTERN.test(value) ? value : null;
}

export function parseYouTubeUrl(input: string): ValidatedYouTubeUrl {
  if (typeof input !== 'string' || input.trim().length === 0 || input.length > 2048) {
    throw new YouTubeUrlError('INVALID_YOUTUBE_URL', 'A YouTube URL is required');
  }
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new YouTubeUrlError('INVALID_YOUTUBE_URL'); }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (parsed.protocol !== 'https:' || !HOSTS.has(host) || parsed.username || parsed.password || parsed.port) {
    throw new YouTubeUrlError('INVALID_YOUTUBE_URL');
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  let route: YouTubeRoute;
  let id: string | null;
  if (host === 'youtu.be') {
    if (segments.length !== 1) throw new YouTubeUrlError('INVALID_YOUTUBE_URL');
    id = identifier(segments[0]);
    route = 'video';
  } else if (segments[0] === 'shorts' && segments.length === 2) {
    id = identifier(segments[1]);
    route = 'short';
  } else if (segments.length === 1 && segments[0] === 'watch') {
    if (!parsed.searchParams.get('v') && parsed.searchParams.has('list')) {
      throw new YouTubeUrlError('PLAYLIST_NOT_SUPPORTED', 'Playlist URLs are not supported');
    }
    if ([...parsed.searchParams.keys()].filter((key) => key === 'v').length !== 1) {
      throw new YouTubeUrlError('INVALID_YOUTUBE_URL');
    }
    id = identifier(parsed.searchParams.get('v'));
    route = 'video';
  } else if (segments[0] === 'playlist') {
    throw new YouTubeUrlError('PLAYLIST_NOT_SUPPORTED', 'Playlist URLs are not supported');
  } else {
    throw new YouTubeUrlError('INVALID_YOUTUBE_URL');
  }
  if (!id) throw new YouTubeUrlError('INVALID_YOUTUBE_URL');
  const canonicalUrl = route === 'short'
    ? `https://www.youtube.com/shorts/${id}`
    : `https://www.youtube.com/watch?v=${id}`;
  // Touch all query keys so this parser remains explicit about dropping tracking
  // and playlist parameters from the canonical URL.
  for (const key of parsed.searchParams.keys()) trackingKey(key);
  return { platform: 'youtube', canonicalUrl, host, route, identifier: id };
}

export function safeParseYouTubeUrl(input: string): { success: true; data: ValidatedYouTubeUrl } | { success: false; error: YouTubeUrlError } {
  try { return { success: true, data: parseYouTubeUrl(input) }; }
  catch (error) { return { success: false, error: error instanceof YouTubeUrlError ? error : new YouTubeUrlError('INVALID_YOUTUBE_URL') }; }
}
