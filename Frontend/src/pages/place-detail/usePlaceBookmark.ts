import {useCallback, useEffect, useRef, useState} from 'react';
import {usePostHog} from 'posthog-react-native';

import {trackActionFinished} from '../../analytics/uiEvents';
import {saveMediaPlace} from '../../entities/content/saved-media-api';
import {deleteSavedPlaces, getSavedPlaces} from '../../entities/info/api';
import type {PlaceReel, SavedPlacesApiError} from '../../entities/info/types';
import type {Place} from '../../entities/place/types';
import {showAlert} from '../../lib/app-alert';
import {
  notifySavedPlaceChanged,
  PLACE_SAVED_MESSAGE,
  PLACE_UNSAVED_MESSAGE,
} from '../../lib/saved-place-events';

export type BookmarkNotice = {id: number; message: string};

type UsePlaceBookmarkOptions = {
  place: Place | null;
  reels: PlaceReel[];
  isReelsLoading: boolean;
  analyticsSource: 'map' | 'place_detail';
  onAuthenticationRequired?: () => void;
  /** 북마크가 바뀐 채로 이 장소 상세를 벗어날 때 호출합니다. 눈앞의 목록이 사라지지 않게 이때 갱신합니다. */
  onLeaveAfterChange?: () => void;
};

/** 장소 상세의 북마크를 그 자리에서 저장·해제합니다. */
export function usePlaceBookmark({
  place,
  reels,
  isReelsLoading,
  analyticsSource,
  onAuthenticationRequired,
  onLeaveAfterChange,
}: UsePlaceBookmarkOptions) {
  const posthog = usePostHog();
  const placeId = place?.id ?? null;
  const [savedPlaceId, setSavedPlaceId] = useState(place?.savedPlaceId ?? null);
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<BookmarkNotice | null>(null);
  const didChangeRef = useRef(false);
  const onLeaveRef = useRef(onLeaveAfterChange);
  onLeaveRef.current = onLeaveAfterChange;

  useEffect(() => {
    setSavedPlaceId(place?.savedPlaceId ?? null);
    setNotice(null);
    return () => {
      if (didChangeRef.current) {
        didChangeRef.current = false;
        onLeaveRef.current?.();
      }
    };
  }, [placeId, place?.savedPlaceId]);

  const announce = useCallback((message: string) => {
    setNotice(current => ({id: (current?.id ?? 0) + 1, message}));
  }, []);

  const commit = useCallback(
    (nextSavedPlaceId: string | null, message: string) => {
      setSavedPlaceId(nextSavedPlaceId);
      didChangeRef.current = true;
      announce(message);
      if (placeId) {
        notifySavedPlaceChanged({placeId, savedPlaceId: nextSavedPlaceId});
      }
    },
    [announce, placeId],
  );

  const remove = useCallback(
    async (currentId: string) => {
      const event = 'saved_place_delete';
      try {
        await deleteSavedPlaces([currentId]);
        trackActionFinished(posthog, event, 'success', {source: analyticsSource});
        commit(null, PLACE_UNSAVED_MESSAGE);
      } catch (nextError) {
        const apiError = nextError as SavedPlacesApiError;
        if (apiError.errorCode === 'CLIENT000_002') {
          try {
            const savedPlaces = await getSavedPlaces();
            if (!savedPlaces.some(item => item.id === currentId)) {
              commit(null, PLACE_UNSAVED_MESSAGE);
              return;
            }
          } catch {
            // 처음의 시간 초과 오류를 그대로 안내해 다시 시도할 수 있게 합니다.
          }
        }
        trackActionFinished(posthog, event, 'failure', {
          source: analyticsSource,
          failure_type: apiError.errorCode,
        });
        showAlert('북마크를 해제하지 못했어요', apiError.message);
        if (apiError.errorCode === 'AUTH401_001' || apiError.errorCode === 'AUTH401_002') {
          onAuthenticationRequired?.();
        }
      }
    },
    [analyticsSource, commit, onAuthenticationRequired, posthog],
  );

  const save = useCallback(
    async (sharedMediaId: string, targetPlaceId: string) => {
      try {
        commit(await saveMediaPlace(sharedMediaId, targetPlaceId), PLACE_SAVED_MESSAGE);
      } catch (error) {
        showAlert('북마크에 저장하지 못했어요', (error as {message?: string}).message);
      }
    },
    [commit],
  );

  const toggle = useCallback(async () => {
    if (!placeId || isPending) {
      return;
    }
    if (savedPlaceId) {
      setIsPending(true);
      await remove(savedPlaceId);
      setIsPending(false);
      return;
    }
    // 저장 API는 어떤 게시물의 장소인지 함께 받으므로 게시물 목록이 있어야 저장할 수 있습니다.
    if (isReelsLoading) {
      return;
    }
    const sharedMediaId = reels[0]?.id;
    if (!sharedMediaId) {
      announce('이 장소의 게시물이 없어 저장할 수 없어요.');
      return;
    }
    setIsPending(true);
    await save(sharedMediaId, placeId);
    setIsPending(false);
  }, [announce, isPending, isReelsLoading, placeId, reels, remove, save, savedPlaceId]);

  return {
    isBookmarked: savedPlaceId !== null,
    isPending: isPending || (savedPlaceId === null && isReelsLoading),
    toggle,
    notice,
  };
}
