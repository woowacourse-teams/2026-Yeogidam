import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {usePostHog} from 'posthog-react-native';

import {
  captureSavedPlaceOpened,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import { getPlaceReels } from '../../entities/info/api';
import { deleteSavedPlaceAndRemoveFromCache } from '../../entities/info/saved-place-deletion';
import type {
  PlaceReel,
  PlaceReelsApiError,
  SavedPlacesApiError,
} from '../../entities/info/types';
import type { Place } from '../../entities/place/types';
import {
  INVALID_REQUEST_ERROR,
  isLoginRequiredError,
  normalizeScreenApiError,
} from '../../lib/api/screen-error';
import { BOTTOM_NAVIGATION_BAR_HEIGHT } from '../../components/BottomNavigationBar';
import { SEARCH_BAR_TOP_GAP } from '../../components/SearchBar';
import { CopyToastProvider } from './components/CopyToast';
import { PlaceDetailActionSheet } from './components/PlaceDetailActionSheet';
import { PlaceDetailContent } from './components/PlaceDetailContent';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
  viewContext?: SavedPlaceViewContext;
  onAuthenticationRequired?: () => void;
  guestReels?: PlaceReel[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
};

export function PlaceDetailScreen({
  onBack,
  place,
  viewContext,
  onAuthenticationRequired,
  guestReels,
  onDeleteGuestPlaces,
}: PlaceDetailScreenProps) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const posthog = usePostHog();
  const capturedPlaceViewIdRef = useRef<string | null>(null);
  const [reels, setReels] = useState<PlaceReel[]>([]);
  const [error, setError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(true);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);

  useEffect(() => {
    if (
      !viewContext ||
      !place.savedAt ||
      capturedPlaceViewIdRef.current === viewContext.placeViewId
    ) {
      return;
    }

    capturedPlaceViewIdRef.current = viewContext.placeViewId;
    captureSavedPlaceOpened(posthog, {
      ...viewContext,
      savedAt: place.savedAt,
    });
  }, [place.savedAt, posthog, viewContext]);

  // App이 다시 그려질 때마다 콜백 참조가 바뀌어도 게시물을 다시 읽지 않도록 ref로 둡니다.
  const onAuthenticationRequiredRef = useRef(onAuthenticationRequired);
  onAuthenticationRequiredRef.current = onAuthenticationRequired;

  const loadPosts = useCallback(async () => {
    if (guestReels !== undefined) {
      setReels(guestReels);
      setError(null);
      setIsReelsLoading(false);
      return;
    }
    // 서버의 미디어 경로는 저장 장소 ID를 쓰므로, 없으면 요청하지 않습니다.
    if (!place.savedPlaceId) {
      setReels([]);
      setError(null);
      setIsReelsLoading(false);
      return;
    }
    setIsReelsLoading(true);
    setError(null);
    try {
      setReels(await getPlaceReels(place.savedPlaceId));
    } catch (nextError) {
      const apiError = normalizeScreenApiError(nextError);
      setError(apiError);
      if (isLoginRequiredError(apiError)) {
        onAuthenticationRequiredRef.current?.();
      }
    } finally {
      setIsReelsLoading(false);
    }
  }, [guestReels, place.savedPlaceId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) {
      return;
    }
    if (onDeleteGuestPlaces) {
      onDeleteGuestPlaces([place.id]);
      setIsActionSheetVisible(false);
      onBack();
      return;
    }
    if (!place.savedPlaceId) {
      setDeleteError({...INVALID_REQUEST_ERROR});
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSavedPlaceAndRemoveFromCache(place.savedPlaceId);
      setIsActionSheetVisible(false);
      onBack();
    } catch (nextError) {
      const apiError = normalizeScreenApiError(nextError);
      setDeleteError(apiError);
      if (isLoginRequiredError(apiError)) {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [
    isDeleting,
    onAuthenticationRequired,
    onBack,
    onDeleteGuestPlaces,
    place.id,
    place.savedPlaceId,
  ]);

  const confirmDelete = useCallback(() => {
    if (isDeleting) {
      return;
    }

    Alert.alert('선택한 장소를 삭제할까요?', '선택한 장소가 보관함에서 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          handleDelete();
        },
      },
    ]);
  }, [handleDelete, isDeleting]);

  return (
    <CopyToastProvider bottomOffset={BOTTOM_NAVIGATION_BAR_HEIGHT + bottomInset + 16}>
      <PlaceDetailContent
        onBack={onBack}
        place={place}
        viewContext={viewContext}
        showTitle={false}
        stickyHeader
        titleInHeader
        compactHeader
        headerTopInset={SEARCH_BAR_TOP_GAP}
        reels={reels}
        reelsError={error}
        isReelsLoading={isReelsLoading}
        onRetryReels={loadPosts}
        onPressMore={guestReels === undefined || onDeleteGuestPlaces ? () => {
          setDeleteError(null);
          setIsActionSheetVisible(true);
        } : undefined}
      />
      <PlaceDetailActionSheet
        visible={isActionSheetVisible && (guestReels === undefined || onDeleteGuestPlaces !== undefined)}
        onClose={() => {
          setDeleteError(null);
          setIsActionSheetVisible(false);
        }}
        onDelete={confirmDelete}
        isDeleting={isDeleting}
        deleteError={deleteError}
      />
    </CopyToastProvider>
  );
}
