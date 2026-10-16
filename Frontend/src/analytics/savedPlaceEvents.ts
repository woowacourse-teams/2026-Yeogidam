import {ANALYTICS_EVENTS} from './eventNames';
import type {AnalyticsClient} from './analytics';
import {isOnboardingSampleId} from '../entities/onboarding/data';
import {capture} from './analytics';

export type SavedPlacesEntryType = 'direct' | 'after_save';
export type SavedPlacesSearchMethod = 'keyboard' | 'recent_search';
export type SavedPlaceSource =
  | 'saved_places_grid'
  | 'saved_places_search'
  | 'map_marker'
  | 'map_search_result';
export type DaysSinceSavedBucket =
  | 'same_day'
  | '1_day'
  | '2_7_days'
  | '8_30_days'
  | '31_plus_days';

type SavedPlaceIdentity = {
  placeId: string;
  savedPlaceId: string;
};

export type SavedPlaceViewContext = SavedPlaceIdentity & {
  placeViewId: string;
  source: SavedPlaceSource;
};

function isSampleSavedPlace(identity: SavedPlaceIdentity) {
  return (
    isOnboardingSampleId(identity.placeId) ||
    isOnboardingSampleId(identity.savedPlaceId)
  );
}

export function getSavedPlaceRevisit(
  savedAt: string,
  viewedAt = new Date(),
): {
  isRevisit: boolean;
  daysSinceSavedBucket: DaysSinceSavedBucket;
} {
  const savedAtMs = Date.parse(savedAt);
  const elapsedMs = Number.isNaN(savedAtMs)
    ? 0
    : Math.max(0, viewedAt.getTime() - savedAtMs);
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  if (elapsedDays < 1) {
    return {isRevisit: false, daysSinceSavedBucket: 'same_day'};
  }
  if (elapsedDays < 2) {
    return {isRevisit: true, daysSinceSavedBucket: '1_day'};
  }
  if (elapsedDays < 8) {
    return {isRevisit: true, daysSinceSavedBucket: '2_7_days'};
  }
  if (elapsedDays < 31) {
    return {isRevisit: true, daysSinceSavedBucket: '8_30_days'};
  }

  return {isRevisit: true, daysSinceSavedBucket: '31_plus_days'};
}

export function captureSavedPlacesViewed(
  client: AnalyticsClient | null | undefined,
  properties: {
    placeCount: number;
    entryType: SavedPlacesEntryType;
  },
) {
  capture(client, ANALYTICS_EVENTS.savedPlacesViewed, {
    place_count: properties.placeCount,
    has_places: properties.placeCount > 0,
    entry_type: properties.entryType,
  });
}

export function captureSavedPlacesSearchSubmitted(
  client: AnalyticsClient | null | undefined,
  properties: {
    searchId: string;
    searchMethod: SavedPlacesSearchMethod;
    resultCount: number;
  },
) {
  capture(client, ANALYTICS_EVENTS.savedPlacesSearchSubmitted, {
    search_id: properties.searchId,
    search_method: properties.searchMethod,
    result_count: properties.resultCount,
    has_result: properties.resultCount > 0,
  });
}

export function captureSavedPlaceSelected(
  client: AnalyticsClient | null | undefined,
  properties: SavedPlaceViewContext & {
    searchId?: string;
    position?: number;
  },
) {
  if (isSampleSavedPlace(properties)) return;

  capture(client, ANALYTICS_EVENTS.savedPlaceSelected, {
    place_id: properties.placeId,
    saved_place_id: properties.savedPlaceId,
    place_view_id: properties.placeViewId,
    source: properties.source,
    ...(properties.searchId === undefined
      ? {}
      : {search_id: properties.searchId}),
    ...(properties.position === undefined
      ? {}
      : {position: properties.position}),
  });
}

export function captureSavedPlaceOpened(
  client: AnalyticsClient | null | undefined,
  properties: SavedPlaceViewContext & {
    savedAt: string;
    viewedAt?: Date;
  },
) {
  if (isSampleSavedPlace(properties)) return;

  const revisit = getSavedPlaceRevisit(
    properties.savedAt,
    properties.viewedAt,
  );

  capture(client, ANALYTICS_EVENTS.savedPlaceOpened, {
    place_id: properties.placeId,
    saved_place_id: properties.savedPlaceId,
    place_view_id: properties.placeViewId,
    source: properties.source,
    is_revisit: revisit.isRevisit,
    days_since_saved_bucket: revisit.daysSinceSavedBucket,
  });
}

export function capturePlaceMapViewed(
  client: AnalyticsClient | null | undefined,
  properties: SavedPlaceViewContext & {
    savedAt: string;
    viewedAt?: Date;
  },
) {
  if (isSampleSavedPlace(properties)) return;

  const {isRevisit} = getSavedPlaceRevisit(
    properties.savedAt,
    properties.viewedAt,
  );

  capture(client, ANALYTICS_EVENTS.placeMapViewed, {
    place_id: properties.placeId,
    saved_place_id: properties.savedPlaceId,
    place_view_id: properties.placeViewId,
    source: properties.source,
    map_provider: 'kakao',
    is_revisit: isRevisit,
  });
}
