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
 * 목록을 한 번 읽은 결과입니다. applied만 화면과 캐시에 반영합니다.
 * superseded는 더 새 요청에 밀린 응답, cleared는 읽는 동안 세션이 끝나 캐시를 비운 뒤 온 응답(화면도 곧 내려감),
 * stale은 읽는 동안 장소를 지워(캐시 세대가 바뀜) 지운 장소가 들어 있는 응답을 버린 결과입니다.
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

  /** 목록을 한 번 읽어 응답을 반영할 수 있으면 반영하고, 어떻게 끝났는지 돌려줍니다. */
  const readSavedPlacesOnce = useCallback(async (): Promise<SavedPlacesReadResult> => {
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
        return readSavedPlacesCache() === null ? {type: 'cleared'} : {type: 'stale'};
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
   * 읽는 동안 세션이 끝나 캐시를 비웠거나, 두 번 읽는 동안 두 번 다 장소를 지웠을 때입니다.
   */
  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return providedPlaces;
    }

    let read = await readSavedPlacesOnce();
    if (read.type === 'stale') {
      // 읽는 동안 지운 장소가 응답에 들어 있으므로 버리고 한 번 더 읽는다.
      read = await readSavedPlacesOnce();
      if (read.type === 'stale') {
        // 다시 읽는 동안에도 지웠으면 그 응답도 버리고 화면이 들고 있는 목록을 둔다.
        setLoadState(SUCCESS);
      }
    }
    return read.type === 'applied' ? read.places : null;
  }, [providedPlaces, readSavedPlacesOnce]);

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
