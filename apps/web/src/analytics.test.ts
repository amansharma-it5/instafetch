import { describe, expect, it } from 'vitest';
import { createAnalytics, type SafeAnalyticsEvent } from './analytics';

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
    client.track('download_failure', 'not-a-category');
    expect(events).toEqual([
      { name: 'resolve_success', category: 'reel' },
      { name: 'download_failure', category: 'unknown' },
    ]);
  });

  it('keeps event payloads free of submitted URLs, tokens, and provider details', () => {
    const events: SafeAnalyticsEvent[] = [];
    const client = createAnalytics({ enabled: true, sink: (event) => events.push(event) });
    client.track('resolve_started', 'post');
    expect(events[0]).toEqual({ name: 'resolve_started', category: 'post' });
    expect(JSON.stringify(events[0])).not.toMatch(/instagram|token|cdn|url/i);
  });
});
