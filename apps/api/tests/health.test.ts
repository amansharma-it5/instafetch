import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, parseAllowedOrigins } from '../src/app';

const provider = { isAvailable: () => true, resolve: async () => ({}) };

describe('health endpoints', () => {
  it('parses multiple exact browser origins without allowing wildcards', () => {
    expect(parseAllowedOrigins('https://instafetch.pages.dev, https://instafetch.example', true)).toEqual(new Set([
      'https://instafetch.pages.dev',
      'https://instafetch.example',
    ]));
    expect(() => parseAllowedOrigins('https://instafetch.pages.dev, *', true)).toThrow('Wildcard CORS origins are not allowed');
  });

  it('reports liveness', async () => {
    const response = await request(createApp({ provider })).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'live' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('returns a bounded request id without trusting unsafe input', async () => {
    const response = await request(createApp({ provider }))
      .get('/health/live')
      .set('X-Request-Id', 'phase6-check');

    expect(response.headers['x-request-id']).toBe('phase6-check');

    const unsafe = await request(createApp({ provider }))
      .get('/health/live')
      .set('X-Request-Id', 'https://provider.example/token');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reports readiness', async () => {
    const response = await request(createApp({ provider })).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', providers: { instagram: true } });
  });
});
