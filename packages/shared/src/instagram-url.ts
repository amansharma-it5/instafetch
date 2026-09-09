import { z } from 'zod';

export type InstagramRoute = 'post' | 'reel' | 'tv' | 'story';

export interface ValidatedInstagramUrl {
  canonicalUrl: string;
  host: 'instagram.com' | 'www.instagram.com';
  route: InstagramRoute;
  identifier: string;
}

const inputSchema = z.string().trim().min(1, 'URL is required').max(2048, 'URL is too long');

function invalid(message: string): never {
  throw new z.ZodError([{ code: 'custom', path: [], message }]);
}

export function parseInstagramUrl(input: unknown): ValidatedInstagramUrl {
  const value = inputSchema.parse(input);
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    invalid('Enter a valid Instagram URL');
  }

  if (parsed.protocol !== 'https:') {
    invalid('Only HTTPS Instagram URLs are supported');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    invalid('Only instagram.com URLs are supported');
  }
  if (parsed.username || parsed.password || parsed.port) {
    invalid('Instagram URL credentials and custom ports are not supported');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const family = segments[0]?.toLowerCase();
  const identifier = segments[1];
  let route: InstagramRoute;

  if (family === 'p' && identifier && segments.length === 2) {
    route = 'post';
  } else if ((family === 'reel' || family === 'reels') && identifier && segments.length === 2) {
    route = 'reel';
  } else if (family === 'tv' && identifier && segments.length === 2) {
    route = 'tv';
  } else if (family === 'stories' && identifier && segments.length === 3) {
    route = 'story';
  } else {
    invalid('Unsupported Instagram URL route');
  }

  return {
    canonicalUrl: `https://www.instagram.com/${family}/${segments.slice(1).join('/')}/`,
    host: hostname as ValidatedInstagramUrl['host'],
    route,
    identifier: segments.at(-1)!,
  };
}

export function safeParseInstagramUrl(input: unknown) {
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    return result;
  }

  try {
    return { success: true as const, data: parseInstagramUrl(result.data) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false as const, error };
    }
    throw error;
  }
}
