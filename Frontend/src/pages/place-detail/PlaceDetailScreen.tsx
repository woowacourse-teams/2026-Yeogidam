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
  // 지우는 중인 저장 장소 ID입니다. 지우는 동안 같은 화면이 다른 장소를 받으면 받은 장소의 삭제 버튼은 막지 않도록 장소마다 둡니다.
  // 지금 App은 상세를 닫은 뒤에만 다른 장소를 열어 새 화면으로 그리므로, 장소마다 두는 상태와 아래 placeRef는 화면이 App의 그리기 방식에 기대지 않게 하는 대비입니다.
  const [deletingSavedPlaceIds, setDeletingSavedPlaceIds] = useState<string[]>([]);
  const isPlaceDeleting =
    place.savedPlaceId !== undefined && deletingSavedPlaceIds.includes(place.savedPlaceId);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);
  // 지우는 동안 같은 화면이 다른 장소를 받을 수 있으므로, 지우기가 끝났을 때 그때 보이는 장소를 읽도록 그릴 때마다 담아 둡니다.
  const placeRef = useRef(place);
  placeRef.current = place;
  // onBack(App의 closeDetail)은 그때 보이는 상세를 닫으므로, 지우는 동안 뒤로 가서 화면이 내려갔으면 끝난 지우기가 onBack을 부르지 않도록 내려갔는지 적어 둡니다.
  // 내려간 화면은 지금 보이는 상세를 알 수 없어, 지우던 장소를 새 화면으로 다시 열었어도 닫지 않습니다. 닫으려면 App이 보이는 상세와 지운 저장 ID를 비교해야 합니다.
  // StrictMode와 Fast Refresh가 effect를 다시 돌려도 false로 굳지 않게 setup에서 true로 되돌립니다.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    if (isPlaceDeleting) {
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

    const savedPlaceId = place.savedPlaceId;
    // 지우기가 끝났을 때 화면이 내려갔거나 다른 장소를 보이면, 삭제 시트를 닫거나 돌아가지 않고 삭제 시트에 지우기 오류를 보이지 않습니다.
    // 캐시에서 빼기와 로그인 요청은 보이는 장소와 상관없이 합니다.
    const isDeletingPlaceShown = () =>
      isMountedRef.current && placeRef.current.savedPlaceId === savedPlaceId;
    setDeletingSavedPlaceIds(current => [...current, savedPlaceId]);
    setDeleteError(null);
    try {
      await deleteSavedPlaceAndRemoveFromCache(savedPlaceId);
      if (isDeletingPlaceShown()) {
        setIsActionSheetVisible(false);
        onBack();
      }
    } catch (nextError) {
      const apiError = normalizeScreenApiError(nextError);
      if (isDeletingPlaceShown()) {
        setDeleteError(apiError);
      }
      if (isLoginRequiredError(apiError)) {
        onAuthenticationRequired?.();
      }
    } finally {
      // 내려간 화면의 상태는 바꾸지 않습니다. 화면이 그대로 있으면 보이는 장소와 상관없이 끝난 장소만 지우는 중에서 뺍니다.
      if (isMountedRef.current) {
        setDeletingSavedPlaceIds(current => current.filter(id => id !== savedPlaceId));
      }
    }
  }, [
    isPlaceDeleting,
    onAuthenticationRequired,
    onBack,
    onDeleteGuestPlaces,
    place.id,
    place.savedPlaceId,
  ]);

  const confirmDelete = useCallback(() => {
    if (isPlaceDeleting) {
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
  }, [handleDelete, isPlaceDeleting]);

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
        isDeleting={isPlaceDeleting}
        deleteError={deleteError}
      />
    </CopyToastProvider>
  );
}
