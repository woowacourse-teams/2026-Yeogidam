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
  /** 화면이 보이는지입니다. 처음 보일 때와 다시 보일 때마다 목록을 읽되, 한 번이라도 받은 뒤에는 보이는 목록을 둔 채 조용히 읽습니다. */
  isActive?: boolean;
};

/**
 * 보관함 목록을 읽고, 당겨서 새로고침하고, 지운 장소를 목록에서 뺍니다.
 * 요청마다 번호를 붙여 늦게 도착한 이전 응답을 버리고, 다시 열 때는 지난 목록(saved-places-cache)을 먼저 보여 줍니다.
 * 화면이 다시 보일 때(isActive)의 읽기는 읽는 중 표시와 오류 화면으로 바꾸지 않아, 돌아오는 전환 중에 배치가 바뀌지 않습니다.
 */
export function useSavedPlacesList({
  providedPlaces,
  onAuthenticationRequired,
  isActive = true,
}: Options) {
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
  // 목록을 한 번이라도 받았는지입니다(넘겨받은 목록과 캐시 포함). 받은 뒤 화면이 다시 보일 때의 읽기는 조용히 합니다.
  const hasLoadedPlacesRef = useRef(providedPlaces !== undefined || readSavedPlacesCache() !== null);

  /**
   * 목록을 한 번 읽어 반영할 수 있으면 반영하고, 읽는 동안 장소를 지워 응답이 낡았으면 canRetry일 때 한 번 더 읽습니다.
   * 반영한 목록을 돌려주고 반영하지 못했으면 null입니다(경우는 loadSavedPlaces 설명에).
   * silent면 읽는 중 표시를 켜지 않고 실패해도 오류 화면으로 바꾸지 않습니다(로그인 필요 오류는 알립니다).
   * 낡은 응답을 버리고 다시 읽기를 시작하거나 읽기를 끝내는(SUCCESS) 일은 요청 번호와 캐시 세대를 비교한 같은 동기 구간에서 합니다.
   * 한 틱이라도 미루면 그사이에 시작한 다른 읽기의 loading을 덮고, 그 읽기와 밀리는 순서가 바뀌며, 그사이에 바뀐 세대를 놓칩니다
   * (세션이 끝난 뒤의 다시 읽기가 목록을 받으면 캐시에 다시 쓰는데, 앱은 토큰을 먼저 지워 그 요청이 401로 끝나므로 mock한 테스트에서만 재현됩니다).
   */
  const readSavedPlaces = useCallback(
    async (canRetry: boolean, silent = false): Promise<Place[] | null> => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      const cacheGeneration = getSavedPlacesCacheGeneration();
      if (!silent) setLoadState(LOADING);
      try {
        const savedPlaces = await getSavedPlaces();
        if (requestId !== loadRequestIdRef.current) {
          // 더 새 요청에 밀렸다.
          return null;
        }
        if (cacheGeneration !== getSavedPlacesCacheGeneration()) {
          // 읽는 동안 세대가 바뀌었는데 캐시가 비어 있다. 세션이 끝났거나(화면이 곧 내려감) 다른 화면에서 지운 것이므로(보관함 화면은
          // 이미 내려가 있음) 읽기 상태를 둔 채 응답만 버리고 다시 읽지 않는다.
          if (readSavedPlacesCache() === null) {
            return null;
          }
          // 읽는 동안 지운 장소가 응답에 들어 있으므로 버리고 같은 동기 구간에서 바로 한 번 더 읽는다.
          // await하지 않아, 다시 읽기의 거부를 바깥 catch가 밀림으로 보아 null로 바꾸지 않게 한다.
          if (canRetry) {
            return readSavedPlaces(false, silent);
          }
          // 다시 읽는 동안에도 지웠으면 그 응답도 버리고 화면이 들고 있는 목록을 둔 채 읽기를 끝낸다.
          setLoadState(SUCCESS);
          return null;
        }
        const nextPlaces = savedPlaces.map(toSavedPlaceDisplayPlace);
        writeSavedPlacesCache(nextPlaces, cacheGeneration);
        hasLoadedPlacesRef.current = true;
        // 같은 목록이면 들고 있던 배열을 그대로 둬, 돌아오는 전환 중에 격자를 다시 그리지 않는다.
        setPlaces(current =>
          JSON.stringify(current) === JSON.stringify(nextPlaces) ? current : nextPlaces,
        );
        setLoadState(SUCCESS);
        return nextPlaces;
      } catch (nextError) {
        if (requestId !== loadRequestIdRef.current) {
          // 더 새 요청에 밀렸다.
          return null;
        }
        const apiError = normalizeScreenApiError(nextError);
        if (!silent) setLoadState({status: 'error', error: apiError});
        if (isLoginRequiredError(apiError)) {
          onAuthenticationRequiredRef.current?.();
        }
        return null;
      }
    },
    [],
  );

  /**
   * 목록을 읽어 반영하고 반영한 목록을 돌려줍니다. 반영하지 못했으면 null입니다. 조회가 실패했거나, 더 새 요청에 밀렸거나,
   * 읽는 동안 캐시 세대가 바뀌었는데 캐시가 비어 있거나(세션이 끝나 비웠거나, 캐시가 빈 동안 시작한 읽기 중에 다른 화면에서 지움),
   * 두 번 읽는 동안 두 번 다 장소를 지웠을 때입니다.
   */
  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return providedPlaces;
    }

    return readSavedPlaces(true);
  }, [providedPlaces, readSavedPlaces]);

  /** 화면이 보일 때 목록을 읽습니다. 한 번이라도 받은 뒤에는 보이는 목록(빈 화면 포함)을 둔 채 조용히 읽습니다. */
  const revalidateSavedPlaces = useCallback(() => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return;
    }

    readSavedPlaces(true, hasLoadedPlacesRef.current);
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
    // 읽는 중이나 오류 화면으로 바뀌면 돌아오는 전환 중에 배치가 바뀌므로, 다시 보일 때는 보이는 내용을 둔 채 읽는다.
    if (isActive) revalidateSavedPlaces();
  }, [isActive, revalidateSavedPlaces]);

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
