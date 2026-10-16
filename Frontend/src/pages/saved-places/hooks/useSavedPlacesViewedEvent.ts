import {useEffect, useRef} from 'react';

import type {AnalyticsClient} from '../../../analytics/analytics';
import {captureSavedPlacesViewed} from '../../../analytics/savedPlaceEvents';
import type {SavedPlacesApiError} from '../../../entities/info/types';

type Options = {
  isLoading: boolean;
  error: SavedPlacesApiError | null;
  placeCount: number;
};

/**
 * 보관함 목록을 처음으로 오류 없이 그렸을 때 조회 이벤트를 한 번 보냅니다.
 * 다시 읽거나 새로고침해도 다시 보내지 않습니다.
 */
export function useSavedPlacesViewedEvent(
  posthog: AnalyticsClient | null | undefined,
  {isLoading, error, placeCount}: Options,
) {
  const hasCapturedViewRef = useRef(false);

  useEffect(() => {
    if (isLoading || error || hasCapturedViewRef.current) {
      return;
    }

    hasCapturedViewRef.current = true;
    captureSavedPlacesViewed(posthog, {
      placeCount,
      entryType: 'direct',
    });
  }, [error, isLoading, placeCount, posthog]);
}
