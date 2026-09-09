import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const provider = { isAvailable: () => true, resolve: async () => ({}) };

describe('health endpoints', () => {
  it('reports liveness', async () => {
    const response = await request(createApp({ provider })).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'live' });
  });

  it('reports readiness', async () => {
    const response = await request(createApp({ provider })).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', providers: { instagram: true } });
  });
});
