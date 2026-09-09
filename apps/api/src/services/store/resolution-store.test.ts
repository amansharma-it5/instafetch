import { describe, expect, it } from 'vitest';
import { ResolutionStore } from './resolution-store';

const item = (id: string) => ({
  id,
  type: 'video' as const,
  width: 1080,
  height: 1920,
  extension: 'mp4',
  qualityLabel: '1080x1920',
  filesize: null,
  providerUrl: `https://cdn.test/${id}.mp4`,
  thumbnailUrl: null,
});

describe('ResolutionStore', () => {
  it('expires records after the configured TTL', () => {
    let now = 1_000;
    const store = new ResolutionStore({ ttlMs: 100, now: () => now, idFactory: () => 'resolution-1' });
    const stored = store.put({
      canonicalUrl: 'https://www.instagram.com/reel/ABC/',
      sourceType: 'reel',
      title: null,
      author: null,
      thumbnailUrl: null,
      isCarousel: false,
      items: [item('media-1')],
    });

    expect(store.get(stored.id)?.items[0].providerUrl).toBe('https://cdn.test/media-1.mp4');
    now = 1_101;
    expect(store.get(stored.id)).toBeUndefined();
    expect(store.size()).toBe(0);
    store.dispose();
  });

  it('removes the oldest resolution when the maximum size is reached', () => {
    let nextId = 0;
    const store = new ResolutionStore({ maxResolutions: 2, idFactory: () => `resolution-${++nextId}` });
    const makeResolution = (id: string) => store.put({
      canonicalUrl: `https://www.instagram.com/p/${id}/`,
      sourceType: 'post',
      title: null,
      author: null,
      thumbnailUrl: null,
      isCarousel: false,
      items: [item(id)],
    });

    const first = makeResolution('one');
    const second = makeResolution('two');
    const third = makeResolution('three');

    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)).toBeDefined();
    expect(store.get(third.id)).toBeDefined();
    expect(store.getByMediaId('three')?.item.providerUrl).toBe('https://cdn.test/three.mp4');
    store.dispose();
  });

  it('rejects resolutions that exceed the item bound', () => {
    const store = new ResolutionStore({ maxItemsPerResolution: 1 });
    expect(() => store.put({
      canonicalUrl: 'https://www.instagram.com/p/ABC/',
      sourceType: 'post',
      title: null,
      author: null,
      thumbnailUrl: null,
      isCarousel: true,
      items: [item('one'), item('two')],
    })).toThrow('maximum item count');
    store.dispose();
  });
});
