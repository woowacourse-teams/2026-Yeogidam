import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {usePostHog} from 'posthog-react-native';
import { trackActionFinished, useScreenAnalytics } from '../../analytics/uiEvents';

import {
  captureSavedPlaceOpened,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import { getPlaceReels } from '../../entities/info/api';
import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../entities/info/types';
import type { Place } from '../../entities/place/types';
import { SEARCH_BAR_TOP_GAP } from '../../components/SearchBar';
import { PlaceFolderAssignPicker } from '../map/components/PlaceFolderPanel';
import { usePlaceFolders } from '../../lib/usePlaceFolders';
import { CopyToastProvider } from './components/CopyToast';
import { PlaceDetailContent } from './components/PlaceDetailContent';
import type { PlaceTab } from './components/PlaceTabs';
import { usePlaceBookmark } from './usePlaceBookmark';
import { usePlaceDetailData } from './usePlaceDetailData';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
  viewContext?: SavedPlaceViewContext;
  onAuthenticationRequired?: () => void;
  guestReels?: PlaceReel[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
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
  const bookmark = usePlaceBookmark({
    place,
    reels,
    isReelsLoading,
    analyticsSource: 'place_detail',
    onAuthenticationRequired,
  });

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

  const canDelete = guestReels === undefined || onDeleteGuestPlaces !== undefined;

  return (
    <CopyToastProvider bottomOffset={bottomInset + 16} notice={bookmark.notice}>
      <PlaceDetailContent
        onBack={onBack}
        place={place}
        viewContext={viewContext}
        showTitle={false}
        stickyHeader
        titleInHeader
        compactHeader
        headerTopInset={SEARCH_BAR_TOP_GAP}
        contentBottomPadding={bottomInset + 24}
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
          canDelete
            ? () => {
                // 비회원 시드 장소는 저장 상태가 없어 지우고 바로 돌아갑니다.
                if (onDeleteGuestPlaces) {
                  onDeleteGuestPlaces([place.id]);
                  onBack();
                  return;
                }
                bookmark.toggle().catch(() => undefined);
              }
            : undefined
        }
        isBookmarked={onDeleteGuestPlaces ? true : bookmark.isBookmarked}
        isInFolder={placeFolderIds.length > 0}
        isDeleting={bookmark.isPending}
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
    </CopyToastProvider>
  );
}
