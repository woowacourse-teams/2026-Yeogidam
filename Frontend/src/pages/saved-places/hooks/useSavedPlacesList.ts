import {useCallback, useEffect, useRef, useState} from 'react';

import {getSavedPlaces} from '../../../entities/info/api';
import {
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  removeFromSavedPlacesCache,
  writeSavedPlacesCache,
} from '../../../entities/info/saved-places-cache';
import type {SavedPlacesApiError} from '../../../entities/info/types';
import {toSavedPlaceDisplayPlace} from '../../../entities/place/api';
import type {Place} from '../../../entities/place/types';
import {isLoginRequiredError, normalizeScreenApiError} from '../../../lib/api/screen-error';

/** 목록 읽기 상태입니다. 캐시나 넘겨받은 목록으로 시작하면 success입니다. */
type SavedPlacesLoadState =
  | {status: 'loading'}
  | {status: 'success'}
  | {status: 'error'; error: SavedPlacesApiError};

const LOADING: SavedPlacesLoadState = {status: 'loading'};
const SUCCESS: SavedPlacesLoadState = {status: 'success'};

type Options = {
  /** 비회원 체험 장소처럼 API 대신 쓸 목록입니다. 있으면 API를 부르지 않습니다. */
  providedPlaces: Place[] | undefined;
  /** 목록 조회가 로그인 필요 오류로 실패하면 부릅니다. */
  onAuthenticationRequired?: () => void;
};

/**
 * 보관함 목록을 읽고, 당겨서 새로고침하고, 지운 장소를 목록에서 뺍니다.
 * 요청마다 번호를 붙여 늦게 도착한 이전 응답을 버리고, 다시 열 때는 지난 목록(saved-places-cache)을 먼저 보여 줍니다.
 */
export function useSavedPlacesList({providedPlaces, onAuthenticationRequired}: Options) {
  const [places, setPlaces] = useState<Place[]>(() => providedPlaces ?? readSavedPlacesCache() ?? []);
  const [loadState, setLoadState] = useState<SavedPlacesLoadState>(() =>
    providedPlaces === undefined && readSavedPlacesCache() === null ? LOADING : SUCCESS,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  // App이 다시 그려질 때마다 콜백 참조가 바뀌어도 목록을 다시 읽지 않도록 ref로 둡니다.
  const onAuthenticationRequiredRef = useRef(onAuthenticationRequired);
  onAuthenticationRequiredRef.current = onAuthenticationRequired;
  // 늦게 도착한 이전 조회 응답이 최신 목록을 덮지 않도록 요청마다 번호를 붙입니다.
  const loadRequestIdRef = useRef(0);

  /**
   * 목록을 읽어 반영하고 읽은 목록을 돌려줍니다. 실패했거나 더 새 요청에 밀렸으면 null입니다.
   * 조회하는 동안 장소를 지우면(캐시 세대가 바뀜) 응답에 지운 장소가 들어 있으므로 버리고 한 번 더 읽습니다.
   */
  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return providedPlaces;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const cacheGeneration = getSavedPlacesCacheGeneration();
      setLoadState(LOADING);
      try {
        const savedPlaces = await getSavedPlaces();
        if (requestId !== loadRequestIdRef.current) {
          return null;
        }
        if (cacheGeneration !== getSavedPlacesCacheGeneration()) {
          // 세션이 끝나 캐시를 비웠으면 화면도 곧 내려가므로 다시 읽지 않는다.
          if (readSavedPlacesCache() === null) {
            return null;
          }
          if (attempt === 0) {
            continue;
          }
          // 다시 읽는 동안에도 지웠으면 낡은 응답을 버리고 화면이 들고 있는 목록을 둔다.
          setLoadState(SUCCESS);
          return null;
        }
        const nextPlaces = savedPlaces.map(toSavedPlaceDisplayPlace);
        writeSavedPlacesCache(nextPlaces, cacheGeneration);
        setPlaces(nextPlaces);
        setLoadState(SUCCESS);
        return nextPlaces;
      } catch (nextError) {
        if (requestId !== loadRequestIdRef.current) {
          return null;
        }
        const apiError = normalizeScreenApiError(nextError);
        setLoadState({status: 'error', error: apiError});
        if (isLoginRequiredError(apiError)) {
          onAuthenticationRequiredRef.current?.();
        }
        return null;
      }
    }
    return null;
  }, [providedPlaces]);

  /** 당겨서 새로고침합니다. 새로고침이 끝나기 전에 다시 당기면 무시합니다. */
  const refreshSavedPlaces = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      await loadSavedPlaces();
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [loadSavedPlaces]);

  useEffect(() => {
    loadSavedPlaces();
  }, [loadSavedPlaces]);

  /** 지운 장소를 화면 목록과 메모리 캐시에서 함께 뺍니다. */
  const removePlaces = useCallback((shouldRemove: (place: Place) => boolean) => {
    removeFromSavedPlacesCache(shouldRemove);
    setPlaces(current => current.filter(place => !shouldRemove(place)));
  }, []);

  return {
    places,
    isLoading: loadState.status === 'loading',
    error: loadState.status === 'error' ? loadState.error : null,
    isRefreshing,
    loadSavedPlaces,
    refreshSavedPlaces,
    removePlaces,
  };
}
