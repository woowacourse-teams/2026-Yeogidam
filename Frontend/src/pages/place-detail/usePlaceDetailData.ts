import { useCallback, useEffect, useRef, useState } from 'react';

import { getPlaceBlogs, getPlaceInfo } from '../../entities/info/api';
import type {
  PlaceBlogSearchResult,
  PlaceDetailInfo,
  PlaceReelsApiError,
} from '../../entities/info/types';
import type { PlaceTab } from './components/PlaceTabs';

export type PlaceDetailApiError = PlaceReelsApiError;

export type PlaceResource<T> = {
  data: T | null;
  error: PlaceDetailApiError | null;
  isLoading: boolean;
  retry: () => void;
};

type ResourceState<T> = {
  placeId: string | null;
  data: T | null;
  error: PlaceDetailApiError | null;
  isLoading: boolean;
};

function usePlaceResource<T>(
  placeId: string | null,
  isTabOpen: boolean,
  fetchResource: (placeId: string) => Promise<T>,
): PlaceResource<T> {
  const [state, setState] = useState<ResourceState<T>>({
    placeId: null,
    data: null,
    error: null,
    isLoading: false,
  });
  // 응답이 늦게 도착해도 마지막 요청의 결과만 화면에 반영합니다.
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    if (placeId === null) {
      return;
    }

    const request = ++latestRequestRef.current;
    setState({ placeId, data: null, error: null, isLoading: true });
    try {
      const data = await fetchResource(placeId);
      if (request === latestRequestRef.current) {
        setState({ placeId, data, error: null, isLoading: false });
      }
    } catch (error) {
      if (request === latestRequestRef.current) {
        setState({
          placeId,
          data: null,
          error: error as PlaceDetailApiError,
          isLoading: false,
        });
      }
    }
  }, [fetchResource, placeId]);

  const isRequested = placeId !== null && state.placeId === placeId;
  const shouldLoad = isTabOpen && placeId !== null && !isRequested;

  useEffect(() => {
    if (shouldLoad) {
      load();
    }
  }, [load, shouldLoad]);

  return {
    data: isRequested ? state.data : null,
    error: isRequested ? state.error : null,
    isLoading: shouldLoad || (isRequested && state.isLoading),
    retry: load,
  };
}

/**
 * 장소 상세의 정보·블로그 탭 데이터를 탭을 처음 열 때 한 번만 불러옵니다.
 * 블로그는 서버가 요청마다 네이버를 호출합니다. 지도 시트는 같은 상세를 미리보기로 한 벌 더 그리므로,
 * 요청이 겹치지 않도록 PlaceDetailContent가 아니라 이를 쓰는 화면에서 한 번만 호출합니다.
 * `placeId`가 null이면(비회원 등) 요청하지 않습니다.
 */
export function usePlaceDetailData(placeId: string | null, activeTab: PlaceTab) {
  const placeInfo = usePlaceResource<PlaceDetailInfo>(
    placeId,
    activeTab === '정보',
    getPlaceInfo,
  );
  const placeBlogs = usePlaceResource<PlaceBlogSearchResult>(
    placeId,
    activeTab === '블로그',
    getPlaceBlogs,
  );

  return { placeInfo, placeBlogs };
}
