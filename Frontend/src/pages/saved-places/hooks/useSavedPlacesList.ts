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

/**
 * 목록을 읽은 결과입니다. applied만 화면과 캐시에 반영합니다.
 * superseded는 더 새 요청에 밀린 응답입니다. cleared는 읽는 동안 캐시 세대가 바뀌었는데 캐시가 비어 있는 경우로,
 * 세션이 끝나 캐시를 비웠을 때(화면도 곧 내려감)와 캐시가 없는 첫 읽기 동안 다른 화면에서 장소를 지웠을 때이며 다시 읽지 않습니다.
 * stale은 읽는 동안 장소를 지워(캐시 세대가 바뀜) 지운 장소가 들어 있는 응답을 두 번 다 버린 결과입니다.
 */
type SavedPlacesReadResult =
  | {type: 'applied'; places: Place[]}
  | {type: 'superseded'}
  | {type: 'cleared'}
  | {type: 'stale'}
  | {type: 'failed'};

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
   * 목록을 한 번 읽어 응답을 반영할 수 있으면 반영하고, 어떻게 끝났는지 돌려줍니다.
   * 읽는 동안 장소를 지워 응답이 낡았으면 canRetry일 때만 한 번 더 읽습니다. 다시 읽기 시작과 읽기 끝내기(SUCCESS)는
   * 요청 번호를 비교한 같은 동기 구간에서 해야, 그사이에 시작한 다른 읽기의 loading을 덮거나 그 읽기와 밀리는 순서가 바뀌지 않습니다.
   */
  const readSavedPlaces = useCallback(async (canRetry: boolean): Promise<SavedPlacesReadResult> => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const cacheGeneration = getSavedPlacesCacheGeneration();
    setLoadState(LOADING);
    try {
      const savedPlaces = await getSavedPlaces();
      if (requestId !== loadRequestIdRef.current) {
        return {type: 'superseded'};
      }
      if (cacheGeneration !== getSavedPlacesCacheGeneration()) {
        if (readSavedPlacesCache() === null) {
          return {type: 'cleared'};
        }
        if (canRetry) {
          return readSavedPlaces(false);
        }
        setLoadState(SUCCESS);
        return {type: 'stale'};
      }
      const nextPlaces = savedPlaces.map(toSavedPlaceDisplayPlace);
      writeSavedPlacesCache(nextPlaces, cacheGeneration);
      setPlaces(nextPlaces);
      setLoadState(SUCCESS);
      return {type: 'applied', places: nextPlaces};
    } catch (nextError) {
      if (requestId !== loadRequestIdRef.current) {
        return {type: 'superseded'};
      }
      const apiError = normalizeScreenApiError(nextError);
      setLoadState({status: 'error', error: apiError});
      if (isLoginRequiredError(apiError)) {
        onAuthenticationRequiredRef.current?.();
      }
      return {type: 'failed'};
    }
  }, []);

  /**
   * 목록을 읽어 반영하고 읽은 목록을 돌려줍니다. 반영하지 못했으면 null입니다. 조회가 실패했거나, 더 새 요청에 밀렸거나,
   * 읽는 동안 세대가 바뀌었는데 캐시가 비어 있거나(cleared), 두 번 읽는 동안 두 번 다 장소를 지웠을 때(stale)입니다.
   */
  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return providedPlaces;
    }

    const read = await readSavedPlaces(true);
    return read.type === 'applied' ? read.places : null;
  }, [providedPlaces, readSavedPlaces]);

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
