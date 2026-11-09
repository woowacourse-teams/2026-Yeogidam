import { showAlert } from '../../lib/app-alert';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {usePostHog} from 'posthog-react-native';
import {
  trackActionFinished,
  useScreenAnalytics,
} from '../../analytics/uiEvents';

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
import type { PlaceTab } from './components/PlaceTabs';
import { usePlaceDetailData } from './usePlaceDetailData';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
  viewContext?: SavedPlaceViewContext;
  onAuthenticationRequired?: () => void;
  guestReels?: PlaceReel[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  bottomNavigationBar?: ReactNode;
  /** 지정하면 게시물을 눌렀을 때 인스타그램 대신 앱 안의 게시물 상세로 이동합니다. */
  onOpenReel?: (reel: PlaceReel) => void;
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
  onOpenReel,
  isGuest = false,
}: PlaceDetailScreenProps) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const posthog = usePostHog();
  const analytics = useScreenAnalytics('place_detail');
  const capturedPlaceViewIdRef = useRef<string | null>(null);
  const [reels, setReels] = useState<PlaceReel[]>([]);
  const [error, setError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(true);
  const [isFolderPickerVisible, setIsFolderPickerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<PlaceTab>('게시물');
  const { placeInfo, placeBlogs } = usePlaceDetailData(
    isGuest || guestReels !== undefined ? null : place.id,
    activeTab,
  );
  const { folders, getPlaceFolderIds, createFolder, setPlaceFolderIds } =
    usePlaceFolders(!isGuest);
  const folderListItems = useMemo(
    () =>
      folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        color: folder.color,
        count: folder.savedPlaceIds.length,
        thumbnail: undefined,
      })),
    [folders],
  );
  const placeFolderIds = getPlaceFolderIds(place);
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
      trackActionFinished(posthog, 'saved_place_delete', 'success', {
        source: 'place_detail',
      });
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

      trackActionFinished(posthog, 'saved_place_delete', 'failure', {
        source: 'place_detail',
        failure_type: apiError.errorCode,
      });
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
    posthog,
    place.savedPlaceId,
  ]);

  // 더보기 시트가 없으므로 해제에 실패하면 알림 창으로 알립니다.
  useEffect(() => {
    if (!deleteError) {
      return;
    }
    showAlert('북마크를 해제하지 못했어요', deleteError.message);
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
        onOpenReel={onOpenReel}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        placeInfo={placeInfo}
        placeBlogs={placeBlogs}
        onPressFolder={
          isGuest
            ? undefined
            : () => {
                analytics.modal('folder_picker');
                setIsFolderPickerVisible(true);
              }
        }
        onPressDelete={
          canDelete ? () => handleDelete().catch(() => undefined) : undefined
        }
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
            analytics.button('folder_picker_save', {
              folder_count: folderIds.length,
            });
            setPlaceFolderIds(place, folderIds).then(saved =>
              trackActionFinished(
                posthog,
                'place_folder_assign',
                saved ? 'success' : 'failure',
                {screen_name: 'place_detail', folder_count: folderIds.length},
              ),
            );
            setIsFolderPickerVisible(false);
          }}
          onCancel={() => {
            analytics.button('folder_picker_cancel');
            setIsFolderPickerVisible(false);
          }}
          onCreateFolder={async (name, color) => {
            analytics.button('folder_create');
            return (await createFolder(name, color))?.id ?? null;
          }}
        />
      )}
      {bottomNavigationBar}
    </CopyToastProvider>
  );
}
