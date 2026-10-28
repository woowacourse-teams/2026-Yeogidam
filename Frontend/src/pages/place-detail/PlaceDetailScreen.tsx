import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {usePostHog} from 'posthog-react-native';

import {
  captureSavedPlaceOpened,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import { deleteSavedPlaces, getPlaceReels, getSavedPlaces } from '../../entities/info/api';
import type {
  PlaceReel,
  PlaceReelsApiError,
  SavedPlacesApiError,
} from '../../entities/info/types';
import type { Place } from '../../entities/place/types';
import { BOTTOM_NAVIGATION_BAR_HEIGHT } from '../../components/BottomNavigationBar';
import { SEARCH_BAR_TOP_GAP } from '../../components/SearchBar';
import { PlaceFolderAssignPicker } from '../map/components/PlaceFolderPanel';
import { usePlaceFolders } from '../../lib/usePlaceFolders';
import { CopyToastProvider } from './components/CopyToast';
import { PlaceDetailContent } from './components/PlaceDetailContent';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
  viewContext?: SavedPlaceViewContext;
  onAuthenticationRequired?: () => void;
  guestReels?: PlaceReel[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  bottomNavigationBar?: ReactNode;
  /** 비회원에게는 폴더 버튼을 보여주지 않습니다. */
  isGuest?: boolean;
};

export function PlaceDetailScreen({
  onBack,
  place,
  viewContext,
  onAuthenticationRequired,
  guestReels,
  onDeleteGuestPlaces,
  bottomNavigationBar,
  isGuest = false,
}: PlaceDetailScreenProps) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const posthog = usePostHog();
  const capturedPlaceViewIdRef = useRef<string | null>(null);
  const [reels, setReels] = useState<PlaceReel[]>([]);
  const [error, setError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(true);
  const [isFolderPickerVisible, setIsFolderPickerVisible] = useState(false);
  const { folders, createFolder, setPlaceFolderIds } = usePlaceFolders(!isGuest);
  const folderListItems = useMemo(
    () =>
      folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        count: folder.placeIds.length,
        thumbnail: undefined,
      })),
    [folders],
  );
  const placeFolderIds = useMemo(
    () =>
      folders
        .filter(folder => folder.placeIds.includes(place.id))
        .map(folder => folder.id),
    [folders, place.id],
  );
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

  const loadPosts = useCallback(async () => {
    if (guestReels !== undefined) {
      setReels(guestReels);
      setError(null);
      setIsReelsLoading(false);
      return;
    }
    setIsReelsLoading(true);
    setError(null);
    try {
      setReels(await getPlaceReels(place.id));
    } catch (nextError) {
      const apiError = nextError as PlaceReelsApiError;
      setError(apiError);
      if (apiError.errorCode === 'AUTH401_001') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsReelsLoading(false);
    }
  }, [guestReels, onAuthenticationRequired, place.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) {
      return;
    }
    if (onDeleteGuestPlaces) {
      onDeleteGuestPlaces([place.id]);
      onBack();
      return;
    }
    if (!place.savedPlaceId) {
      setDeleteError({
        status: 400,
        errorCode: 'COMMON400_001',
        message: '요청 내용을 확인해주세요.',
        retryable: false,
      });
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSavedPlaces([place.savedPlaceId]);
      onBack();
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      if (apiError.errorCode === 'CLIENT000_002') {
        try {
          const savedPlaces = await getSavedPlaces();
          if (!savedPlaces.some(savedPlace => savedPlace.id === place.savedPlaceId)) {
            onBack();
            return;
          }
        } catch {
          // Keep the original timeout error and allow the user to retry.
        }
      }

      setDeleteError(apiError);
      if (apiError.errorCode === 'AUTH401_001' || apiError.errorCode === 'AUTH401_002') {
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
          handleDelete().catch(() => undefined);
        },
      },
    ]);
  }, [handleDelete, isDeleting]);

  // 더보기 시트가 없으므로 삭제에 실패하면 알림 창으로 알립니다.
  useEffect(() => {
    if (!deleteError) {
      return;
    }
    Alert.alert('삭제하지 못했어요', deleteError.message);
    setDeleteError(null);
  }, [deleteError]);

  const canDelete = guestReels === undefined || onDeleteGuestPlaces !== undefined;

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
        onPressFolder={isGuest ? undefined : () => setIsFolderPickerVisible(true)}
        onPressDelete={canDelete ? confirmDelete : undefined}
        isInFolder={placeFolderIds.length > 0}
        isDeleting={isDeleting}
      />
      {isGuest ? null : (
        <PlaceFolderAssignPicker
          visible={isFolderPickerVisible}
          placeName={place.name}
          folders={folderListItems}
          selectedFolderIds={placeFolderIds}
          onSave={folderIds => {
            setPlaceFolderIds(place, folderIds);
            setIsFolderPickerVisible(false);
          }}
          onCancel={() => setIsFolderPickerVisible(false)}
          onCreateFolder={async (name, color) =>
            (await createFolder(name, color))?.id ?? null
          }
        />
      )}
      {bottomNavigationBar}
    </CopyToastProvider>
  );
}
