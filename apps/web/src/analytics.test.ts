import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, createAnalytics, type SafeAnalyticsEvent } from './analytics';

describe('privacy-safe analytics', () => {
  it('is disabled by default and emits no events', () => {
    const events: unknown[] = [];
    createAnalytics({ sink: (event) => events.push(event) }).track('page_view', 'reel');
    expect(events).toEqual([]);
  });

  it('emits only allowlisted event names and categories when enabled', () => {
    const events: unknown[] = [];
    const client = createAnalytics({ enabled: true, sink: (event) => events.push(event) });
    client.track('resolve_success', 'reel');
    client.track('not_allowed', 'reel');
    client.track('download_failed', 'not-a-category');
    expect(events).toEqual([
      { name: 'resolve_success', category: 'reel' },
      { name: 'download_failed', category: 'unknown' },
    ]);
  });

  it('keeps the launch event vocabulary explicit', () => {
    expect(ANALYTICS_EVENTS).toEqual([
      'page_view',
      'resolve_started',
      'resolve_success',
      'resolve_failed',
      'preview_opened',
      'download_started',
      'download_success',
      'download_failed',
      'language_changed',
    ]);
  });

  it('records success and failure semantics without adding payload fields', () => {
    const events: SafeAnalyticsEvent[] = [];
    const client = createAnalytics({ enabled: true, sink: (event) => events.push(event) });
    client.track('resolve_success', 'reel');
    client.track('resolve_failed', 'reel');
    client.track('preview_opened', 'reel');
    client.track('download_success', 'reel');
    client.track('download_failed', 'reel');
    client.track('language_changed', 'unknown');
    expect(events).toEqual([
      { name: 'resolve_success', category: 'reel' },
      { name: 'resolve_failed', category: 'reel' },
      { name: 'preview_opened', category: 'reel' },
      { name: 'download_success', category: 'reel' },
      { name: 'download_failed', category: 'reel' },
      { name: 'language_changed', category: 'unknown' },
    ]);
  });

  it('keeps event payloads free of submitted URLs, tokens, and provider details', () => {
    const events: SafeAnalyticsEvent[] = [];
    const client = createAnalytics({ enabled: true, sink: (event) => events.push(event) });
    client.track('resolve_started', 'post');
    client.track('download_success', 'https://www.instagram.com/reel/secret/?token=provider-secret');
    expect(events[0]).toEqual({ name: 'resolve_started', category: 'post' });
    expect(events[1]).toEqual({ name: 'download_success', category: 'unknown' });
    expect(JSON.stringify(events)).not.toMatch(/instagram|token|cdn|url|secret/i);
  });
});
