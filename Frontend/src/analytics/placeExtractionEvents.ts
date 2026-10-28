import {ANALYTICS_EVENTS} from './eventNames';
import {isOnboardingSampleId} from '../entities/onboarding/data';
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
  'reel_share_outcome_viewed',
  'share_local_save_resolved',
  'share_delivery_status_changed',
  'extraction_request_started',
  'extraction_request_finished',
] as const;

export type ShareExtractionEventName = typeof SHARE_EXTRACTION_EVENTS[number];
export type HistoryVisibleState = 'loading' | 'processing' | 'success' | 'failed';
export type HistoryDetailResult = 'success' | 'failed';

/** 공유 확장이 아니라 앱 안에서 직접 시작한 추출 요청의 진입 경로입니다. */
export type AppExtractionSource = 'history_retry';
export type AppExtractionFailureType =
  | 'auth_failed'
  | 'timeout'
  | 'network_error'
  | 'server_error'
  | 'invalid_request';

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
  reel_share_outcome_viewed: ['outcome', 'reason'],
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
  capture(client, ANALYTICS_EVENTS.historyViewed, {
    ...getCommonAnalyticsProperties(),
    view_state: viewState,
  });
}

export function trackHistoryContentViewed(
  client: AnalyticsClient | null | undefined,
  contentId: string,
  visibleState: HistoryVisibleState,
) {
  if (isOnboardingSampleId(contentId)) return;
  capture(client, ANALYTICS_EVENTS.historyContentViewed, {
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
  if (isOnboardingSampleId(contentId)) return;
  capture(client, ANALYTICS_EVENTS.historyContentDetailViewed, {
    ...getCommonAnalyticsProperties(),
    content_id: contentId,
    result,
  });
}

/** API 오류 코드와 HTTP 상태를 `failure_type`으로 분류합니다. */
export function toExtractionFailureType(error: {
  errorCode?: string | null;
  status?: number | null;
}): AppExtractionFailureType {
  switch (error.errorCode) {
    case 'AUTH401_001':
    case 'AUTH401_002':
    case 'AUTH403_001':
      return 'auth_failed';
    case 'CLIENT000_002':
      return 'timeout';
    case 'CLIENT000_001':
      return 'network_error';
    case 'DATA500_001':
    case 'COMMON500_001':
      return 'server_error';
    case 'REEL400_001':
    case 'COMMON400_001':
    case 'COMMON405_001':
      return 'invalid_request';
  }

  if (typeof error.status === 'number') {
    if (error.status >= 500) return 'server_error';
    if (error.status >= 400) return 'invalid_request';
  }

  return 'network_error';
}

/**
 * 앱이 분석 API를 직접 호출하기 직전에 기록합니다. 공유 확장의 같은 이름 이벤트와
 * 구분하려고 `source`를 넣고, `share_id` 대신 API의 `clientRequestId`를 `request_id`로 보냅니다.
 */
export function trackExtractionRequestStarted(
  client: AnalyticsClient | null | undefined,
  params: {requestId: string; source: AppExtractionSource},
) {
  capture(client, ANALYTICS_EVENTS.extractionRequestStarted, {
    request_id: params.requestId,
    source: params.source,
  });
}

/** 2xx 응답을 받았다면 응답 안의 추출 상태와 관계없이 `response_received`입니다. */
export function trackExtractionRequestFinished(
  client: AnalyticsClient | null | undefined,
  params: {requestId: string; source: AppExtractionSource} & (
    | {outcome: 'response_received'; contentId?: string}
    | {
        outcome: 'request_failed';
        failureType: AppExtractionFailureType;
        responseStatus?: number | null;
      }
  ),
) {
  capture(client, ANALYTICS_EVENTS.extractionRequestFinished, {
    request_id: params.requestId,
    source: params.source,
    outcome: params.outcome,
    ...(params.outcome === 'response_received'
      ? params.contentId === undefined
        ? {}
        : {content_id: params.contentId}
      : {
          failure_type: params.failureType,
          ...(typeof params.responseStatus === 'number'
            ? {response_status: params.responseStatus}
            : {}),
        }),
  });
}
