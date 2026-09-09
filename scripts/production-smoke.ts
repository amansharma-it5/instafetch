import { parseInstagramUrl } from '@instafetch/shared';

const frontendOrigin = (process.env.SMOKE_FRONTEND_ORIGIN ?? 'https://instafetch.pages.dev').replace(/\/$/, '');
const apiOrigin = (process.env.SMOKE_API_ORIGIN ?? 'https://instafetch-nm9b.onrender.com').replace(/\/$/, '');
const args = process.argv.slice(2);

if (args.length > 1) {
  console.error('Usage: npm run smoke:production -- [public-reel-url]');
  process.exitCode = 2;
} else {
  const timeoutMs = 30_000;
  async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const result: Record<string, unknown> = {};
  try {
    const frontend = await fetchWithTimeout(frontendOrigin);
    result.frontend = { status: frontend.status, ok: frontend.ok };

    const live = await fetchWithTimeout(`${apiOrigin}/health/live`);
    result.healthLive = { status: live.status, ok: live.ok };

    const ready = await fetchWithTimeout(`${apiOrigin}/health/ready`);
    result.healthReady = { status: ready.status, ok: ready.ok };

    if (args[0]) {
      const validated = parseInstagramUrl(args[0]);
      if (validated.route !== 'reel') throw new Error('The optional smoke-test URL must be a public Reel');
      const resolved = await fetchWithTimeout(`${apiOrigin}/api/instagram/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: validated.canonicalUrl }),
      });
      const body = await resolved.json() as { success?: boolean; data?: { sourceType?: string; items?: unknown[] }; error?: { code?: string } };
      result.reel = {
        validation: 'passed',
        status: resolved.status,
        success: body.success === true,
        sourceType: body.data?.sourceType ?? null,
        itemCount: body.data?.items?.length ?? 0,
        errorCode: body.error?.code ?? null,
        responseContainsProviderUrl: JSON.stringify(body).match(/cdninstagram|fbcdn|scontent|fbsbx/i) !== null,
      };
    }

    console.log(JSON.stringify(result));
    if (!frontend.ok || !live.ok || !ready.ok || (result.reel && (result.reel as { success: boolean }).success !== true)) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/gi, '[redacted-url]') : 'Smoke test failed';
    console.error(JSON.stringify({ ...result, error: message }));
    process.exitCode = 1;
  }
}
