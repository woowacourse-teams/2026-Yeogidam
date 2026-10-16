/**
 * 비활성: 대기함 화면이 제거되어(#379, #389, #390) 현재 앱에서 호출되지 않습니다.
 * 대기함 복원 시 다시 사용하려고 보존하며, Funnel과 지표에는 사용하지 않습니다.
 * 상태는 docs/POSTHOG_SHARE_EXPERIENCE_PLAN.md의 "비활성 이벤트"에서 관리합니다.
 */
import {ANALYTICS_EVENTS} from './eventNames';
import {
  capture,
  getCommonAnalyticsProperties,
  type AnalyticsClient,
} from './analytics';

export type InboxEntryType = 'direct' | 'auto';
export type PlaceResolutionOutcome = 'success' | 'failure';
export type PlaceResolutionFailureType =
  | 'network_error'
  | 'auth_failed'
  | 'unknown';

export function trackPendingPlacesViewed(
  client: AnalyticsClient | null | undefined,
  params: {entryType: InboxEntryType; itemCount: number},
) {
  capture(client, ANALYTICS_EVENTS.pendingPlacesViewed, {
    ...getCommonAnalyticsProperties(),
    entry_type: params.entryType,
    item_count: params.itemCount,
  });
}

export function trackPendingPlaceSaveFinished(
  client: AnalyticsClient | null | undefined,
  params: {
    contentId: string;
    placeId: string;
    outcome: PlaceResolutionOutcome;
    failureType?: PlaceResolutionFailureType;
  },
) {
  capture(client, ANALYTICS_EVENTS.pendingPlaceSaveFinished, {
    ...getCommonAnalyticsProperties(),
    content_id: params.contentId,
    place_id: params.placeId,
    outcome: params.outcome,
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
  });
}

export function trackPendingPlaceDiscardFinished(
  client: AnalyticsClient | null | undefined,
  params: {
    contentId: string;
    placeId: string;
    outcome: PlaceResolutionOutcome;
    failureType?: PlaceResolutionFailureType;
  },
) {
  capture(client, ANALYTICS_EVENTS.pendingPlaceDiscardFinished, {
    ...getCommonAnalyticsProperties(),
    content_id: params.contentId,
    place_id: params.placeId,
    outcome: params.outcome,
    ...(params.outcome === 'failure' && params.failureType
      ? {failure_type: params.failureType}
      : {}),
  });
}

export function trackPendingResolutionCompleted(
  client: AnalyticsClient | null | undefined,
  params: {action: 'save' | 'discard'; processedCount: number},
) {
  capture(client, ANALYTICS_EVENTS.pendingResolutionCompleted, {
    ...getCommonAnalyticsProperties(),
    action: params.action,
    processed_count: params.processedCount,
  });
}
