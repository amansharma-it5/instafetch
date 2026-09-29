export const ANALYTICS_EVENTS = [
  'page_view',
  'resolve_started',
  'resolve_success',
  'resolve_failed',
  'preview_opened',
  'download_started',
  'download_success',
  'download_failed',
  'language_changed',
] as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENTS[number];
export type AnalyticsCategory = 'reel' | 'post' | 'story' | 'tv' | 'youtube' | 'unknown';

export interface SafeAnalyticsEvent {
  name: AnalyticsEventName;
  category: AnalyticsCategory;
}

type AnalyticsSink = (event: SafeAnalyticsEvent) => void;

const allowedEvents = new Set<string>(ANALYTICS_EVENTS);
const allowedCategories = new Set<AnalyticsCategory>(['reel', 'post', 'story', 'tv', 'youtube', 'unknown']);

export function categoryForSourceType(sourceType: string | undefined): AnalyticsCategory {
  if (sourceType === 'youtube' || sourceType === 'youtube_video' || sourceType === 'youtube_short') return 'youtube';
  return sourceType && allowedCategories.has(sourceType as AnalyticsCategory)
    ? sourceType as AnalyticsCategory
    : 'unknown';
}

export function createAnalytics(options: { enabled?: boolean; sink?: AnalyticsSink } = {}) {
  const enabled = options.enabled ?? false;
  const sink = options.sink ?? (() => undefined);
  return {
    track(name: string, category: string = 'unknown'): void {
      if (!enabled || !allowedEvents.has(name)) return;
      const event: SafeAnalyticsEvent = {
        name: name as AnalyticsEventName,
        category: categoryForSourceType(category),
      };
      sink(event);
    },
  };
}

export const analytics = createAnalytics({
  enabled: import.meta.env.VITE_ANALYTICS_ENABLED === 'true',
});
