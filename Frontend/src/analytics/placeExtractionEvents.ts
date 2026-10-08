import {
  capture,
  getAnalyticsEnvironment,
  getCommonAnalyticsProperties,
  type AnalyticsClient,
} from './analytics';

/** Events captured by the Android/iOS share outbox before the app opens. */
export const SHARE_EXTRACTION_EVENTS = [
  'reel_share_received',
  'reel_share_feedback_viewed',
  'share_local_save_resolved',
  'share_delivery_status_changed',
  'extraction_request_started',
  'extraction_request_finished',
] as const;

export type ShareExtractionEventName = typeof SHARE_EXTRACTION_EVENTS[number];
export type HistoryVisibleState = 'loading' | 'processing' | 'success' | 'failed';
export type HistoryDetailResult = 'success' | 'failed';

export function isShareExtractionEventName(
  name: string,
): name is ShareExtractionEventName {
  return (SHARE_EXTRACTION_EVENTS as readonly string[]).includes(name);
}

type NativeShareEvent = {
  uuid?: string;
  name: ShareExtractionEventName;
  share_id: string;
  distinct_id?: string;
  occurred_at: number;
  properties: Record<string, string | number | boolean>;
};

const COMMON_KEYS = ['platform', 'release', 'environment', 'installation_id'];
const EVENT_KEYS: Record<ShareExtractionEventName, string[]> = {
  reel_share_received: [],
  reel_share_feedback_viewed: ['feedback_type'],
  share_local_save_resolved: ['outcome'],
  share_delivery_status_changed: ['delivery_status', 'reason'],
  extraction_request_started: [],
  extraction_request_finished: [
    'outcome',
    'response_status',
    'failure_type',
    'content_id',
  ],
};

/** The same payload is used by native delivery and app-open fallback. */
export function buildShareExtractionCapture(event: NativeShareEvent) {
  const allowed = new Set([...COMMON_KEYS, ...EVENT_KEYS[event.name]]);
  const properties = Object.fromEntries(
    Object.entries(event.properties ?? {}).filter(([key]) => allowed.has(key)),
  );
  const environment = typeof properties.environment === 'string' && properties.environment.trim()
    ? properties.environment.trim()
    : getAnalyticsEnvironment();
  const distinctId = event.distinct_id?.trim() || event.share_id;
  return {
    ...(event.uuid ? {uuid: event.uuid} : {}),
    event: event.name,
    distinct_id: distinctId,
    timestamp: new Date(event.occurred_at).toISOString(),
    properties: {
      ...properties,
      environment,
      share_id: event.share_id,
      ...(distinctId === event.share_id ? {$process_person_profile: false} : {}),
    },
  };
}

export function trackHistoryViewed(
  client: AnalyticsClient | null | undefined,
  viewState: 'list' | 'empty' | 'error',
) {
  capture(client, 'history_viewed', {
    ...getCommonAnalyticsProperties(),
    view_state: viewState,
  });
}

export function trackHistoryContentViewed(
  client: AnalyticsClient | null | undefined,
  contentId: string,
  visibleState: HistoryVisibleState,
) {
  capture(client, 'history_content_viewed', {
    ...getCommonAnalyticsProperties(),
    content_id: contentId,
    visible_state: visibleState,
  });
}

export function trackHistoryContentDetailViewed(
  client: AnalyticsClient | null | undefined,
  contentId: string,
  result: HistoryDetailResult,
) {
  capture(client, 'history_content_detail_viewed', {
    ...getCommonAnalyticsProperties(),
    content_id: contentId,
    result,
  });
}
