import { randomUUID } from 'node:crypto';
import type { InstagramRoute } from '@instafetch/shared';
import type { InternalMediaItem } from '../extraction/normalize-instagram.js';

export interface StoredResolution {
  id: string;
  canonicalUrl: string;
  createdAt: number;
  expiresAt: number;
  sourceType: InstagramRoute;
  title: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  isCarousel: boolean;
  itemCount: number;
  resolvedItemCount: number;
  partial: boolean;
  warning: string | null;
  items: InternalMediaItem[];
}

type ResolutionInput = Omit<StoredResolution, 'id' | 'createdAt' | 'expiresAt' | 'itemCount' | 'resolvedItemCount' | 'partial' | 'warning'> &
  Partial<Pick<StoredResolution, 'itemCount' | 'resolvedItemCount' | 'partial' | 'warning'>>;

export interface ResolutionStoreOptions {
  ttlMs?: number;
  maxResolutions?: number;
  maxItemsPerResolution?: number;
  now?: () => number;
  idFactory?: () => string;
}

export class ResolutionStore {
  private readonly resolutions = new Map<string, StoredResolution>();
  private readonly ttlMs: number;
  private readonly maxResolutions: number;
  private readonly maxItemsPerResolution: number;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(options: ResolutionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.maxResolutions = options.maxResolutions ?? 100;
    this.maxItemsPerResolution = options.maxItemsPerResolution ?? 100;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
    this.cleanupTimer = setInterval(() => this.cleanup(), Math.max(10, Math.min(this.ttlMs, 60_000)));
    this.cleanupTimer.unref();
  }

  put(resolution: ResolutionInput): StoredResolution {
    if (resolution.items.length > this.maxItemsPerResolution) {
      throw new Error('Resolution exceeds the maximum item count');
    }
    this.cleanup();
    while (this.resolutions.size >= this.maxResolutions) {
      const oldest = this.resolutions.keys().next().value;
      if (typeof oldest !== 'string') {
        break;
      }
      this.resolutions.delete(oldest);
    }

    const createdAt = this.now();
    const stored: StoredResolution = {
      ...resolution,
      itemCount: resolution.itemCount ?? resolution.items.length,
      resolvedItemCount: resolution.resolvedItemCount ?? resolution.items.length,
      partial: resolution.partial ?? false,
      warning: resolution.warning ?? null,
      id: this.idFactory(),
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    };
    this.resolutions.set(stored.id, stored);
    return stored;
  }

  get(id: string): StoredResolution | undefined {
    this.cleanup();
    const resolution = this.resolutions.get(id);
    if (!resolution || resolution.expiresAt <= this.now()) {
      this.resolutions.delete(id);
      return undefined;
    }
    return resolution;
  }

  getByMediaId(mediaId: string): { resolution: StoredResolution; item: InternalMediaItem } | undefined {
    this.cleanup();
    for (const resolution of this.resolutions.values()) {
      const item = resolution.items.find((candidate) => candidate.id === mediaId);
      if (item) {
        return { resolution, item };
      }
    }
    return undefined;
  }

  size(): number {
    this.cleanup();
    return this.resolutions.size;
  }

  cleanup(): void {
    const currentTime = this.now();
    for (const [id, resolution] of this.resolutions) {
      if (resolution.expiresAt <= currentTime) {
        this.resolutions.delete(id);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }
}
