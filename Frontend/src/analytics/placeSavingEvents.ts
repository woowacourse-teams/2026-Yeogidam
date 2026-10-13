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
  capture(client, 'pending_places_viewed', {
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
  capture(client, 'pending_place_save_finished', {
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
  capture(client, 'pending_place_discard_finished', {
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
  capture(client, 'pending_resolution_completed', {
    ...getCommonAnalyticsProperties(),
    action: params.action,
    processed_count: params.processedCount,
  });
}
