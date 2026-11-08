import {useCallback, useMemo, useRef, useState} from 'react';

import {searchSavedMedia} from '../../entities/content/saved-media-api';
import type {HistoryCursor, HistoryReel} from '../../entities/content/types';
import {searchSavedPlaces} from '../../entities/info/api';
import {toSavedPlaceDisplayPlace} from '../../entities/place/api';
import type {Place} from '../../entities/place/types';

const SEARCH_ERROR_MESSAGE = '검색하지 못했어요.';

function toErrorMessage(error: unknown) {
  return (error as {message?: string}).message ?? SEARCH_ERROR_MESSAGE;
}

/** 서버에 저장하지 않은 게스트 장소는 기기 안에서 이름·주소로 거릅니다. */
export function filterPlacesByKeyword(places: Place[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return places.filter(place =>
    [place.name, place.address, place.fullAddress].some(value =>
      value.toLowerCase().includes(normalizedQuery),
    ),
  );
}

type UseSavedLibrarySearchOptions = {
  places: Place[];
  isGuest: boolean;
};

/**
 * 보관함 검색어와 결과를 관리합니다. 장소 탭은 장소 검색, 게시물 탭은 캡션 검색 결과를 씁니다.
 * 검색어가 바뀌면 이전 요청의 응답은 버립니다.
 */
export function useSavedLibrarySearch({places, isGuest}: UseSavedLibrarySearchOptions) {
  const [query, setQuery] = useState<string | null>(null);
  const [placeResults, setPlaceResults] = useState<Place[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [reels, setReels] = useState<HistoryReel[]>([]);
  const [reelCursor, setReelCursor] = useState<HistoryCursor | null>(null);
  const [isLoadingReels, setIsLoadingReels] = useState(false);
  const [reelError, setReelError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const isLoadingMoreReelsRef = useRef(false);
  const placesRef = useRef(places);
  placesRef.current = places;

  const searchPlaces = useCallback(
    async (nextQuery: string, requestId: number) => {
      setIsLoadingPlaces(true);
      setPlaceError(null);
      try {
        const results = isGuest
          ? filterPlacesByKeyword(placesRef.current, nextQuery)
          : (await searchSavedPlaces(nextQuery)).map(toSavedPlaceDisplayPlace);
        if (requestId !== requestIdRef.current) return 0;
        setPlaceResults(results);
        return results.length;
      } catch (error) {
        if (requestId === requestIdRef.current) setPlaceError(toErrorMessage(error));
        return 0;
      } finally {
        if (requestId === requestIdRef.current) setIsLoadingPlaces(false);
      }
    },
    [isGuest],
  );

  const searchReels = useCallback(
    async (nextQuery: string, requestId: number, cursor?: HistoryCursor) => {
      // 게스트는 서버에 담긴 게시물이 없습니다.
      if (isGuest) return 0;
      isLoadingMoreReelsRef.current = true;
      setIsLoadingReels(true);
      setReelError(null);
      try {
        const page = await searchSavedMedia(nextQuery, cursor);
        if (requestId !== requestIdRef.current) return 0;
        setReels(current => cursor
          ? [...current, ...page.reels.filter(reel => !current.some(item => item.id === reel.id))]
          : page.reels);
        setReelCursor(page.nextCursor);
        return page.reels.length;
      } catch (error) {
        if (requestId === requestIdRef.current) setReelError(toErrorMessage(error));
        return 0;
      } finally {
        if (requestId === requestIdRef.current) {
          isLoadingMoreReelsRef.current = false;
          setIsLoadingReels(false);
        }
      }
    },
    [isGuest],
  );

  /** 두 검색이 끝나면 결과 수를 돌려주고, 그사이 검색어가 바뀌었으면 null을 돌려줍니다. */
  const search = useCallback(
    async (nextQuery: string) => {
      const requestId = ++requestIdRef.current;
      setQuery(nextQuery);
      setPlaceResults([]);
      setReels([]);
      setReelCursor(null);
      const [placeCount, reelCount] = await Promise.all([
        searchPlaces(nextQuery, requestId),
        searchReels(nextQuery, requestId),
      ]);
      return requestId === requestIdRef.current ? {placeCount, reelCount} : null;
    },
    [searchPlaces, searchReels],
  );

  const loadMoreReels = useCallback(() => {
    if (query === null || !reelCursor || isLoadingMoreReelsRef.current) return;
    searchReels(query, requestIdRef.current, reelCursor).catch(() => undefined);
  }, [query, reelCursor, searchReels]);

  const retryPlaces = useCallback(() => {
    if (query === null) return;
    searchPlaces(query, requestIdRef.current).catch(() => undefined);
  }, [query, searchPlaces]);

  const retryReels = useCallback(() => {
    if (query === null) return;
    searchReels(query, requestIdRef.current, reelCursor ?? undefined).catch(() => undefined);
  }, [query, reelCursor, searchReels]);

  const clear = useCallback(() => {
    requestIdRef.current += 1;
    isLoadingMoreReelsRef.current = false;
    setQuery(null);
    setPlaceResults([]);
    setIsLoadingPlaces(false);
    setPlaceError(null);
    setReels([]);
    setReelCursor(null);
    setIsLoadingReels(false);
    setReelError(null);
  }, []);

  /** 검색 결과에서 삭제한 항목을 다시 불러오지 않고 바로 뺍니다. */
  const removePlaces = useCallback((shouldRemove: (place: Place) => boolean) => {
    setPlaceResults(current => current.filter(place => !shouldRemove(place)));
  }, []);

  const removeReels = useCallback((reelIds: Set<string>) => {
    setReels(current => current.filter(reel => !reelIds.has(reel.id)));
  }, []);

  return useMemo(
    () => ({
      query,
      places: placeResults,
      isLoadingPlaces,
      placeError,
      reels,
      reelCursor,
      isLoadingReels,
      reelError,
      search,
      loadMoreReels,
      retryPlaces,
      retryReels,
      clear,
      removePlaces,
      removeReels,
    }),
    [
      query,
      placeResults,
      isLoadingPlaces,
      placeError,
      reels,
      reelCursor,
      isLoadingReels,
      reelError,
      search,
      loadMoreReels,
      retryPlaces,
      retryReels,
      clear,
      removePlaces,
      removeReels,
    ],
  );
}
