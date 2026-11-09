import { showAlert } from '../../../lib/app-alert';
import {
  SwipeBackStack,
  type BackGestureRegion,
} from '../../../components/navigation/SwipeBackStack';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  LayoutAnimation,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderCallbacks,
} from 'react-native';
import { usePostHog } from 'posthog-react-native';
import {
  trackActionFinished,
  useScreenAnalytics,
} from '../../../analytics/uiEvents';
import { v4 as uuidv4 } from 'uuid';

import {
  captureSavedPlaceOpened,
  captureSavedPlaceSelected,
  type SavedPlaceViewContext,
} from '../../../analytics/savedPlaceEvents';
import {
  deleteSavedPlaces,
  getPlaceReels,
  getSavedPlaces,
} from '../../../entities/info/api';
import type {
  PlaceReel,
  PlaceReelsApiError,
  SavedPlacesApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import {
  SEARCH_BAR_HEIGHT,
  SEARCH_BAR_TOP_GAP,
} from '../../../components/SearchBar';
import { CopyToastProvider } from '../../place-detail/components/CopyToast';
import type { PlaceTab } from '../../place-detail/components/PlaceTabs';
import {
  CATEGORY_CHIPS_HEIGHT,
  CATEGORY_CHIPS_TOP_GAP,
} from '../../../components/CategoryFilterChips';
import { PlaceDetailContent } from '../../place-detail/components/PlaceDetailContent';
import { usePlaceDetailData } from '../../place-detail/usePlaceDetailData';

export type MapSheetPage = {
  isBackPreview?: boolean;
  clearsSearch?: boolean;
  isDetail: boolean;
  isExpanded: boolean;
  place: Place | null;
  sheetHeight: number;
  sheetBottomOffset: number;
  sheetVisibleHeight: number;
  translateY: Animated.Value | number;
};

/**
 * 장소 목록이 비었을 때의 안내입니다. 보관함과 같은 기준(검색 결과 없음, 카테고리에만 없음, 저장한 장소 없음)에
 * 장소는 있지만 지금 지도 영역에 없는 경우를 더했습니다.
 */
export type PlaceResultEmptyState =
  | { kind: 'noSearchResults' }
  | { kind: 'noSearchResultsInCategory'; category: string }
  | { kind: 'noSavedPlaces'; category: string | null }
  | { kind: 'outOfArea'; isSearch: boolean };

/** 빈 안내가 바뀔 때 새 안내를 서서히 보여 줘, 칩을 넘길 때 그림이 툭 바뀌지 않게 합니다. */
function FadeInOnChange({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return (
    <Animated.View style={[styles.emptyMessage, { opacity }]}>
      {children}
    </Animated.View>
  );
}

function PlaceResultEmptyMessage({
  emptyState,
}: {
  emptyState: PlaceResultEmptyState;
}) {
  return emptyState.kind === 'noSearchResults' ? (
    <>
      <Image
        source={require('../../../assets/illustrations/dami-search-no-results-cropped.png')}
        style={styles.searchEmptyIllustration}
      />
      <Text style={styles.emptyResultTitle}>검색 결과가 없어요</Text>
      <Text style={styles.emptyResultText}>
        다른 키워드로 다시 검색해보세요.
      </Text>
    </>
  ) : emptyState.kind === 'noSearchResultsInCategory' ? (
    <>
      <Image
        source={require('../../../assets/illustrations/dami-empty-category-cropped.png')}
        style={styles.categoryEmptyIllustration}
      />
      <Text style={styles.emptyResultTitle}>
        {emptyState.category} 카테고리에 검색 결과가 없어요
      </Text>
      <Text style={styles.emptyResultText}>다른 카테고리를 골라보세요.</Text>
    </>
  ) : emptyState.kind === 'noSavedPlaces' ? (
    <>
      <Image
        source={require('../../../assets/illustrations/dami-empty-box-small-cropped.png')}
        style={styles.emptyIllustration}
      />
      <Text style={styles.emptyResultTitle}>
        {emptyState.category
          ? `${emptyState.category} 카테고리에 저장한 장소가 없어요`
          : '아직 저장한 장소가 없어요'}
      </Text>
      <Text style={styles.emptyResultText}>
        {emptyState.category
          ? '다른 카테고리를 골라보세요.'
          : '장소를 저장하면 지도에서 확인할 수 있어요.'}
      </Text>
    </>
  ) : (
    <>
      <Image
        source={require('../../../assets/illustrations/dami-looking-around-cropped.png')}
        style={styles.areaEmptyIllustration}
      />
      <Text style={styles.emptyResultTitle}>
        {emptyState.isSearch
          ? '이 지도 영역에 검색 결과가 없어요'
          : '이 지도 영역에 저장한 장소가 없어요'}
      </Text>
      <Text style={styles.emptyResultText}>
        지도를 움직여 다른 곳도 확인해보세요.
      </Text>
    </>
  );
}

type PlaceResultSheetProps = {
  /** 지정하면 장소 상세의 게시물을 눌렀을 때 앱 안의 게시물 상세로 이동합니다. */
  onOpenReel?: (reel: PlaceReel) => void;
  pageHeight: number;
  renderPage: (sheet: React.ReactNode, page: MapSheetPage) => React.ReactNode;
  /** Keep the native map outside the sheet navigation stack. */
  renderMap?: (page: MapSheetPage) => React.ReactNode;
  isActive?: boolean;
  pageBackAvailable?: boolean;
  pageBackStateKey?: string;
  onPageBack?: () => void;
  onBackGestureRegionChange?: (region: BackGestureRegion) => void;
  backPlaces?: Place[];
  places: Place[];
  emptyState?: PlaceResultEmptyState;
  /** 목록 위에 고정되는 폴더 전환/폴더 상세 헤더입니다. */
  folderHeader?: React.ReactNode;
  /** 지정하면 장소 목록 대신 이 내용을 보여줍니다(폴더 목록). */
  folderContent?: React.ReactNode;
  /** 폴더 상세 뒤에 유지할 폴더 목록 화면의 헤더와 내용입니다. */
  backFolderHeader?: React.ReactNode;
  backFolderContent?: React.ReactNode;
  /** 장소 목록이 비었을 때 기본 안내 대신 보여줄 내용입니다. */
  emptyContent?: React.ReactNode;
  isSavedPlacesLoading?: boolean;
  savedPlacesLoadFailed?: boolean;
  isVisibleAreaUpdating?: boolean;
  translateY?: Animated.Value;
  topInset?: number;
  bottomTabOffset?: number;
  /** 장소 상세에는 바텀 네비게이션이 없어 하단 안전 영역만큼만 띄웁니다. */
  detailBottomOffset?: number;
  onExpandedChange?: (isExpanded: boolean) => void;
  onVisibleHeightChange?: (height: number) => void;
  collapseSignal?: number;
  mapPanCollapseSignal?: number;
  expandSignal?: number;
  openPlace?: Place | null;
  openPlaceContext?: SavedPlaceViewContext | null;
  openPlaceId?: string;
  openPlaceSignal?: number;
  backToPlaceListSignal?: number;
  onDetailViewChange?: (isDetailView: boolean, placeId: string | null) => void;
  /** 목록에서 장소를 열 때 호출합니다. 중간 높이 시트가 가리는 높이를 함께 넘깁니다. */
  onListPlaceSelect?: (place: Place, sheetVisibleHeight: number) => void;
  onAuthenticationRequired?: () => void;
  onGuestExpandInteraction?: () => void;
  onSavedPlaceDeleted?: (savedPlaceId: string) => void;
  guestReelsByPlace?: Record<string, PlaceReel[]>;
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  /** 지정하면 상세 더보기에 폴더 담기/수정이 나타납니다. */
  onEditPlaceFolders?: (place: Place) => void;
  getPlaceFoldersLabel?: (place: Place) => string;
};

export const COLLAPSED_SHEET_HEIGHT = 84;
const COLLAPSED_HANDLE_HEIGHT = 44;
const COLLAPSED_CONTENT_VISIBLE_HEIGHT = 91;
const MIDDLE_VISIBLE_RATIO = 0.58;
const PAGE_MODE_TRIGGER_OFFSET = 72;
const MIDDLE_TO_EXPANDED_DRAG_THRESHOLD = 48;
const MIDDLE_TO_EXPANDED_VELOCITY_THRESHOLD = 0.35;
// iOS에서 상세 본문을 맨 위에서 이만큼 당기거나 이 속도(pt/ms)로 놓으면 시트를 한 단계 내립니다.
const DETAIL_PULL_DOWN_DISTANCE = 48;
const DETAIL_PULL_DOWN_VELOCITY = 0.5;
const BOTTOM_TAB_CLEARANCE = 92;
export const LIST_TOP_GAP = 12;
const DETAIL_PAGE_BOTTOM_PADDING = 68;
const DETAIL_ACTION_BOTTOM_PADDING = 24;
const RESULT_ITEM_HEIGHT = 116;

function getMiddleCategory(category?: string) {
  if (!category) return undefined;

  const categories = category
    .split('>')
    .map(item => item.trim())
    .filter(Boolean);
  return categories[1] ?? categories[0];
}

export function PlaceResultSheet({
  onOpenReel,
  pageHeight,
  renderPage,
  renderMap,
  isActive = true,
  pageBackAvailable = false,
  pageBackStateKey = '',
  onPageBack,
  onBackGestureRegionChange,
  backPlaces,
  places,
  emptyState = { kind: 'noSavedPlaces', category: null },
  folderHeader,
  folderContent,
  backFolderHeader,
  backFolderContent,
  emptyContent,
  isSavedPlacesLoading = false,
  savedPlacesLoadFailed = false,
  isVisibleAreaUpdating = false,
  translateY: sharedTranslateY,
  topInset = 0,
  bottomTabOffset = 0,
  detailBottomOffset = 0,
  onExpandedChange,
  onVisibleHeightChange,
  collapseSignal = 0,
  mapPanCollapseSignal = 0,
  expandSignal = 0,
  openPlace,
  openPlaceContext,
  openPlaceId,
  openPlaceSignal = 0,
  backToPlaceListSignal = 0,
  onDetailViewChange,
  onListPlaceSelect,
  onAuthenticationRequired,
  onGuestExpandInteraction,
  onSavedPlaceDeleted,
  guestReelsByPlace,
  onDeleteGuestPlaces,
  onEditPlaceFolders,
  getPlaceFoldersLabel,
}: PlaceResultSheetProps) {
  const canOpenDetailMore =
    guestReelsByPlace === undefined || onDeleteGuestPlaces !== undefined;
  const posthog = usePostHog();
  const analytics = useScreenAnalytics('map');
  const { width: windowWidth } = useWindowDimensions();
  const photoWidth = Math.min(104, Math.max(92, windowWidth * 0.25));
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceViewContext, setSelectedPlaceViewContext] =
    useState<SavedPlaceViewContext | null>(null);
  const [selectedPlaceReels, setSelectedPlaceReels] = useState<PlaceReel[]>([]);
  const [reelsError, setReelsError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(
    null,
  );
  const collapsedHeight =
    COLLAPSED_HANDLE_HEIGHT +
    COLLAPSED_CONTENT_VISIBLE_HEIGHT +
    (selectedPlace ? detailBottomOffset : 0);
  const sheetHeight = Math.max(
    collapsedHeight,
    pageHeight - (selectedPlace ? 0 : bottomTabOffset),
  );
  const collapsedOffset = sheetHeight - collapsedHeight;
  // The results sheet sits above the bottom navigation, while the detail
  // sheet reaches the screen bottom. Use their shared screen-space height so
  // the middle snap lands at the same vertical position in both modes.
  const middleLayoutHeight = selectedPlace
    ? sheetHeight
    : sheetHeight + bottomTabOffset;
  const middleOffset = Math.min(
    collapsedOffset,
    middleLayoutHeight * (1 - MIDDLE_VISIBLE_RATIO),
  );
  // 목록과 장소 상세 시트 모두 카테고리 칩 아래까지만 올라갑니다.
  const listTopOffset = Math.min(
    middleOffset,
    topInset +
      SEARCH_BAR_TOP_GAP +
      SEARCH_BAR_HEIGHT +
      CATEGORY_CHIPS_TOP_GAP +
      CATEGORY_CHIPS_HEIGHT +
      LIST_TOP_GAP,
  );
  const topOffset = listTopOffset;
  const snapOffsets = useMemo(
    () => [topOffset, middleOffset, collapsedOffset],
    [collapsedOffset, middleOffset, topOffset],
  );
  const internalTranslateY = useRef(new Animated.Value(middleOffset)).current;
  // Retained scenes must never share a vertical animation node. Opening a
  // marker expands the detail, while the list underneath stays at its entry snap.
  const listTranslateY = sharedTranslateY ?? internalTranslateY;
  const detailTranslateY = useRef(new Animated.Value(middleOffset)).current;
  const translateY = selectedPlace ? detailTranslateY : listTranslateY;
  const didInitializeSharedTranslateY = useRef(false);
  if (sharedTranslateY && !didInitializeSharedTranslateY.current) {
    sharedTranslateY.setValue(middleOffset);
    didInitializeSharedTranslateY.current = true;
  }
  const currentOffset = useRef(middleOffset);
  const dragStartOffset = useRef(middleOffset);
  const collapsedBodyTouchStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreCollapsedBodyTap = useRef(false);
  const previousSelectedPlaceId = useRef<string | null>(
    selectedPlace?.id ?? null,
  );
  const startedInPageMode = useRef(false);
  const sheetDragRevision = useRef(0);
  const previousGeometry = useRef({
    sheetHeight,
    middleOffset,
    collapsedOffset,
    listTopOffset,
    hasDetail: selectedPlace !== null,
  });
  const handledCollapseSignal = useRef(collapseSignal);
  const handledMapPanCollapseSignal = useRef(mapPanCollapseSignal);
  const handledExpandSignal = useRef(expandSignal);
  const handledOpenPlaceSignal = useRef(openPlaceSignal);
  const handledBackToPlaceListSignal = useRef(backToPlaceListSignal);
  const capturedPlaceViewIdRef = useRef<string | null>(null);
  const isPageModeRef = useRef(false);
  const resultsScrollOffsetRef = useRef(0);
  const resultsListRef = useRef<FlatList<Place>>(null);
  const pendingResultsScrollOffsetRef = useRef<number | null>(null);
  const restoringResultsScrollOffsetRef = useRef<number | null>(null);
  const restoreScheduledRef = useRef(false);
  const isResultsUserScrollingRef = useRef(false);
  const [activeSnapIndex, setActiveSnapIndex] = useState(1);
  const detailEntrySnapIndex = useRef(activeSnapIndex);
  const completingPageSwipe = useRef(false);
  const [detailTab, setDetailTab] = useState<PlaceTab>('게시물');
  const { placeInfo, placeBlogs } = usePlaceDetailData(
    guestReelsByPlace !== undefined ? null : selectedPlace?.id ?? null,
    detailTab,
  );
  const detailScrollOffset = useRef(0);
  const detailScrollRef = useRef<ScrollView>(null);
  // Android에서 끝까지 올린 상세의 본문이 맨 위에 있으면 ScrollView 스크롤을 잠급니다.
  // 잠그지 않으면 빠르게 쓸어내릴 때 ScrollView가 JS보다 먼저 터치를 가로채 시트가 내려가지 않습니다.
  // 잠긴 동안 위로 끄는 스크롤은 detailPullDownResponder가 직접 처리합니다.
  const [isDetailAtTop, setIsDetailAtTop] = useState(true);
  const isDetailTopLockedRef = useRef(false);
  const isScrollingLockedDetail = useRef(false);
  const [, refreshBackPreview] = useState(0);
  const dragStartSnapIndex = useRef(activeSnapIndex);
  const [isPageMode, setIsPageMode] = useState(false);
  const [tapDirection, setTapDirection] = useState<'up' | 'down'>('up');
  const isExpanded = activeSnapIndex === 0;
  const backGestureTop = Math.max(0, snapOffsets[activeSnapIndex]);
  const backGestureBottom = selectedPlace ? detailBottomOffset : bottomTabOffset;
  useLayoutEffect(() => {
    onBackGestureRegionChange?.({
      top: backGestureTop,
      bottom: backGestureBottom,
    });
  }, [backGestureBottom, backGestureTop, onBackGestureRegionChange]);
  // Both the preview and the committed back action use this destination.
  const backSnapIndex = selectedPlace
    ? detailEntrySnapIndex.current
    : activeSnapIndex === 0
    ? 1
    : activeSnapIndex;

  const reportVisibleHeight = useCallback(
    (offset: number) => {
      onVisibleHeightChange?.(sheetHeight - offset);
    },
    [onVisibleHeightChange, sheetHeight],
  );
  useLayoutEffect(() => {
    // Report the actual destination, including a collapsed/expanded list.
    // A route change must not temporarily reapply the initial middle height.
    reportVisibleHeight(snapOffsets[activeSnapIndex]);
  }, [activeSnapIndex, reportVisibleHeight, snapOffsets]);

  const recordResultsScroll = useCallback((offset: number) => {
    const nextOffset = Math.max(0, offset);
    const restoringOffset = restoringResultsScrollOffsetRef.current;

    // A newly mounted FlatList can emit offset=0 after the restored offset was
    // applied. Ignore only that mount-time event. Any event during an actual
    // user drag must always become the latest saved position.
    if (
      !isResultsUserScrollingRef.current &&
      nextOffset === 0 &&
      resultsScrollOffsetRef.current > 0
    ) {
      return;
    }

    if (
      restoringOffset !== null &&
      (isResultsUserScrollingRef.current ||
        Math.abs(nextOffset - restoringOffset) <= 1)
    ) {
      restoringResultsScrollOffsetRef.current = null;
    }
    resultsScrollOffsetRef.current = nextOffset;
  }, []);
  const restoreResultsScroll = useCallback(() => {
    const savedOffset = pendingResultsScrollOffsetRef.current;
    if (savedOffset === null || restoreScheduledRef.current) {
      return;
    }

    restoreScheduledRef.current = true;
    pendingResultsScrollOffsetRef.current = null;
    restoringResultsScrollOffsetRef.current = savedOffset;
    resultsScrollOffsetRef.current = savedOffset;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          restoreScheduledRef.current = false;
          resultsListRef.current?.scrollToOffset({
            offset: savedOffset,
            animated: false,
          });
        });
      });
    });
  }, []);
  useEffect(() => {
    onDetailViewChange?.(selectedPlace !== null, selectedPlace?.id ?? null);
  }, [onDetailViewChange, selectedPlace]);

  useEffect(() => {
    if (
      !selectedPlaceViewContext ||
      !selectedPlace?.savedAt ||
      capturedPlaceViewIdRef.current === selectedPlaceViewContext.placeViewId
    ) {
      return;
    }

    capturedPlaceViewIdRef.current = selectedPlaceViewContext.placeViewId;
    captureSavedPlaceOpened(posthog, {
      ...selectedPlaceViewContext,
      savedAt: selectedPlace.savedAt,
    });
  }, [posthog, selectedPlace, selectedPlaceViewContext]);

  const loadSelectedPlaceReels = useCallback(async () => {
    if (!selectedPlace) {
      return;
    }

    if (guestReelsByPlace !== undefined) {
      setSelectedPlaceReels(guestReelsByPlace[selectedPlace.id] ?? []);
      setReelsError(null);
      setIsReelsLoading(false);
      return;
    }

    setIsReelsLoading(true);
    setReelsError(null);
    try {
      setSelectedPlaceReels(await getPlaceReels(selectedPlace.id));
    } catch (error) {
      setReelsError(error as PlaceReelsApiError);
    } finally {
      setIsReelsLoading(false);
    }
  }, [guestReelsByPlace, selectedPlace]);

  useEffect(() => {
    loadSelectedPlaceReels();
  }, [loadSelectedPlaceReels]);

  const updatePageMode = useCallback((nextIsPageMode: boolean) => {
    if (isPageModeRef.current === nextIsPageMode) {
      return;
    }

    isPageModeRef.current = nextIsPageMode;
    setIsPageMode(nextIsPageMode);
  }, []);
  useEffect(() => {
    onExpandedChange?.(activeSnapIndex === 0);
  }, [activeSnapIndex, onExpandedChange]);

  const snapTo = useCallback(
    (nextOffset: number, targetTranslateY = translateY) => {
      const clampedOffset = Math.max(
        topOffset,
        Math.min(collapsedOffset, nextOffset),
      );
      const nearestSnapIndex = snapOffsets.reduce(
        (closestIndex, offset, index) =>
          Math.abs(offset - clampedOffset) <
          Math.abs(snapOffsets[closestIndex] - clampedOffset)
            ? index
            : closestIndex,
        0,
      );
      const nearestOffset = snapOffsets[nearestSnapIndex];

      const nextIsPageMode = nearestSnapIndex === 0 && selectedPlace !== null;
      if (
        !completingPageSwipe.current &&
        isPageModeRef.current !== nextIsPageMode
      ) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }

      currentOffset.current = nearestOffset;
      if (nearestSnapIndex < activeSnapIndex) {
        setTapDirection('up');
      } else if (nearestSnapIndex > activeSnapIndex) {
        setTapDirection('down');
      }
      setActiveSnapIndex(nearestSnapIndex);
      updatePageMode(nextIsPageMode);
      reportVisibleHeight(nearestOffset);
      if (completingPageSwipe.current) {
        targetTranslateY.stopAnimation();
        targetTranslateY.setValue(nearestOffset);
        return;
      }
      Animated.spring(targetTranslateY, {
        toValue: nearestOffset,
        useNativeDriver: true,
        damping: 22,
        stiffness: 240,
        mass: 0.7,
      }).start();
    },
    [
      activeSnapIndex,
      collapsedOffset,
      reportVisibleHeight,
      selectedPlace,
      snapOffsets,
      topOffset,
      translateY,
      updatePageMode,
    ],
  );

  useEffect(() => {
    const nextPlaceId = selectedPlace?.id ?? null;
    if (previousSelectedPlaceId.current === nextPlaceId) {
      return;
    }

    previousSelectedPlaceId.current = nextPlaceId;
    setDetailTab('게시물');
    detailScrollOffset.current = 0;
    setIsDetailAtTop(true);
  }, [selectedPlace]);

  const hasDetail = selectedPlace !== null;
  useLayoutEffect(() => {
    const previous = previousGeometry.current;
    if (
      previous.sheetHeight === sheetHeight &&
      previous.middleOffset === middleOffset &&
      previous.collapsedOffset === collapsedOffset &&
      previous.listTopOffset === listTopOffset
    )
      return;

    previousGeometry.current = {
      sheetHeight,
      middleOffset,
      collapsedOffset,
      listTopOffset,
      hasDetail,
    };
    // 상세를 열면 시트가 바텀 네비게이션까지 길어져 높이가 바뀐다. 이때 위치를 다시 맞추면
    // 목록 높이에서 중간 높이로 내려오는 애니메이션이 끊기므로, 여는 쪽이 정한 위치를 그대로 둔다.
    if (!previous.hasDetail && hasDetail) return;
    // Preserve the logical snap, not a pixel value from a different layout.
    // Do not restore state from stopAnimation's asynchronous native callback:
    // it can arrive after a back action and overwrite its destination height.
    const offset = snapOffsets[activeSnapIndex];
    translateY.stopAnimation();
    translateY.setValue(offset);
    currentOffset.current = offset;
    reportVisibleHeight(offset);
  }, [
    activeSnapIndex,
    collapsedOffset,
    hasDetail,
    listTopOffset,
    middleOffset,
    reportVisibleHeight,
    sheetHeight,
    snapOffsets,
    translateY,
  ]);

  useEffect(() => {
    if (collapseSignal === handledCollapseSignal.current) {
      return;
    }

    handledCollapseSignal.current = collapseSignal;
    if (isPageMode || activeSnapIndex === 0) {
      snapTo(snapOffsets[1]);
    } else if (activeSnapIndex === 1) {
      snapTo(snapOffsets[2]);
    }
  }, [activeSnapIndex, collapseSignal, isPageMode, snapOffsets, snapTo]);

  useEffect(() => {
    if (mapPanCollapseSignal === handledMapPanCollapseSignal.current) {
      return;
    }

    handledMapPanCollapseSignal.current = mapPanCollapseSignal;
    if (activeSnapIndex === 1) {
      snapTo(snapOffsets[2]);
    }
  }, [activeSnapIndex, mapPanCollapseSignal, snapOffsets, snapTo]);

  useEffect(() => {
    if (expandSignal === handledExpandSignal.current) {
      return;
    }

    handledExpandSignal.current = expandSignal;
    setSelectedPlace(null);
    setSelectedPlaceViewContext(null);
    // 검색 결과는 바로 확인할 수 있도록 목록 높이까지 시트를 엽니다.
    snapTo(snapOffsets[1]);
  }, [expandSignal, snapOffsets, snapTo]);

  useEffect(() => {
    if (
      openPlaceSignal === handledOpenPlaceSignal.current ||
      (!openPlace && !openPlaceId)
    ) {
      return;
    }

    const place =
      openPlace ?? places.find(candidate => candidate.id === openPlaceId);
    // A marker press recentres the map, during which the visible-place list is
    // intentionally cleared until native reports the new bounds. Do not
    // consume this request during that transient empty state; retry when the
    // list is populated again.
    if (!place) return;

    handledOpenPlaceSignal.current = openPlaceSignal;
    detailEntrySnapIndex.current = activeSnapIndex;
    detailTranslateY.stopAnimation();
    detailTranslateY.setValue(currentOffset.current);
    setSelectedPlace(place);
    setSelectedPlaceViewContext(openPlaceContext ?? null);
    snapTo(snapOffsets[1], detailTranslateY);
  }, [
    detailTranslateY,
    openPlace,
    openPlaceContext,
    openPlaceId,
    openPlaceSignal,
    places,
    activeSnapIndex,
    snapOffsets,
    snapTo,
  ]);

  const sheetDragCallbacks = useMemo<PanResponderCallbacks>(
    () => ({
      // 끝까지 올린 상세(페이지 모드)에서도 핸들을 끌어 시트를 내릴 수 있어야 하므로 막지 않습니다.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const revision = ++sheetDragRevision.current;
        startedInPageMode.current = isPageModeRef.current;
        dragStartSnapIndex.current = activeSnapIndex;
        dragStartOffset.current = currentOffset.current;
        translateY.stopAnimation(value => {
          if (sheetDragRevision.current !== revision) return;
          dragStartOffset.current = value;
          currentOffset.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        // Ignore a delayed stopAnimation callback once dragging has moved
        // the sheet; it must not restore the old middle-height position.
        sheetDragRevision.current += 1;
        let nextOffset = Math.max(
          topOffset,
          Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
        );

        // Once the sheet reaches the search bar, it becomes a page and its
        // actual animated position is reset as well. Keeping both positions
        // aligned makes repeated open/close drags reliable.
        if (selectedPlace) {
          if (isPageModeRef.current) {
            if (nextOffset <= PAGE_MODE_TRIGGER_OFFSET) {
              nextOffset = 0;
            } else {
              updatePageMode(false);
            }
          } else if (nextOffset <= PAGE_MODE_TRIGGER_OFFSET) {
            nextOffset = 0;
            updatePageMode(true);
          }
        }

        currentOffset.current = nextOffset;
        // Reaching page mode removes the handle that owns this responder.
        // Commit the logical snap now, before its release can be lost.
        if (selectedPlace && nextOffset === 0) setActiveSnapIndex(0);
        translateY.setValue(nextOffset);
      },
      onPanResponderRelease: (_, gesture) => {
        sheetDragRevision.current += 1;
        if (gesture.dy < -4 || gesture.vy < -0.35) {
          onGuestExpandInteraction?.();
        }

        if (Math.abs(gesture.dy) < 3) {
          analytics.button('sheet_handle_tap');
          snapTo(isExpanded ? collapsedOffset : topOffset);
          return;
        }
        analytics.gesture('sheet_drag', {
          direction: gesture.dy < 0 ? 'up' : 'down',
          from_snap: dragStartSnapIndex.current,
        });

        const releasedOffset = Math.max(
          topOffset,
          Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
        );
        if (
          startedInPageMode.current &&
          releasedOffset > PAGE_MODE_TRIGGER_OFFSET
        ) {
          snapTo(snapOffsets[1]);
          return;
        }

        if (dragStartSnapIndex.current === 2 && gesture.dy < -4) {
          snapTo(snapOffsets[1]);
          return;
        }

        if (dragStartSnapIndex.current === 1 && gesture.dy < 0) {
          const shouldExpand =
            Math.abs(gesture.dy) >= MIDDLE_TO_EXPANDED_DRAG_THRESHOLD ||
            gesture.vy <= -MIDDLE_TO_EXPANDED_VELOCITY_THRESHOLD;
          snapTo(shouldExpand ? snapOffsets[0] : snapOffsets[1]);
          return;
        }

        snapTo(releasedOffset);
      },
      onPanResponderTerminate: () => {
        sheetDragRevision.current += 1;
        snapTo(currentOffset.current);
      },
    }),
    [
      activeSnapIndex,
      analytics,
      collapsedOffset,
      isExpanded,
      selectedPlace,
      snapOffsets,
      snapTo,
      topOffset,
      translateY,
      onGuestExpandInteraction,
      updatePageMode,
    ],
  );
  const panResponder = useMemo(
    () => PanResponder.create(sheetDragCallbacks),
    [sheetDragCallbacks],
  );
  // 펼친 상세는 본문이 스크롤되므로, 본문이 맨 위일 때 아래로 당기면 시트를 끌어내립니다.
  // Android는 맨 위에서 더 당겨도 본문이 스크롤되지 않으므로 이 드래그가 그대로 시트를 움직입니다.
  // 이 응답자는 Android에만, 그것도 본문 ScrollView 안쪽에 붙습니다. 바깥에 붙이면 응답자를
  // 잡은 직후 ScrollView가 터치를 가로채 드래그가 끊깁니다. iOS는 아래 onTopPull 경로를 씁니다.
  // 끝까지 올린 페이지 모드에서는 iOS처럼 끄는 동안 시트만 따라 내리고, 손을 놓을 때 한 단계
  // 내릴지 정합니다.
  const detailPullDownResponder = useMemo(() => {
    const shouldPullDown: PanResponderCallbacks['onMoveShouldSetPanResponder'] =
      (_, gesture) => {
        const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
        if (isDetailTopLockedRef.current) {
          // 스크롤이 잠긴 동안에는 위로 끄는 것도 받아 본문을 직접 스크롤합니다.
          if (Math.abs(gesture.dy) <= 4 || !isVertical) return false;
          isScrollingLockedDetail.current = gesture.dy < 0;
          return true;
        }
        isScrollingLockedDetail.current = false;
        return detailScrollOffset.current <= 0 && gesture.dy > 4 && isVertical;
      };
    return PanResponder.create({
      ...sheetDragCallbacks,
      onMoveShouldSetPanResponder: shouldPullDown,
      onMoveShouldSetPanResponderCapture: shouldPullDown,
      onPanResponderGrant: (event, gesture) => {
        if (isScrollingLockedDetail.current) return;
        sheetDragCallbacks.onPanResponderGrant?.(event, gesture);
      },
      onPanResponderTerminate: (event, gesture) => {
        if (isScrollingLockedDetail.current) return;
        sheetDragCallbacks.onPanResponderTerminate?.(event, gesture);
      },
      onPanResponderMove: (event, gesture) => {
        if (isScrollingLockedDetail.current) {
          detailScrollRef.current?.scrollTo({
            y: Math.max(0, -gesture.dy),
            animated: false,
          });
          return;
        }
        if (!startedInPageMode.current) {
          sheetDragCallbacks.onPanResponderMove?.(event, gesture);
          return;
        }
        sheetDragRevision.current += 1;
        const offset = Math.max(
          topOffset,
          Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
        );
        currentOffset.current = offset;
        translateY.setValue(offset);
      },
      onPanResponderRelease: (event, gesture) => {
        if (isScrollingLockedDetail.current) {
          // 손을 놓을 때 위로 튕긴 속도만큼 조금 더 스크롤해 관성을 흉내 냅니다.
          detailScrollRef.current?.scrollTo({
            y: Math.max(0, -gesture.dy + Math.max(0, -gesture.vy) * 250),
            animated: true,
          });
          return;
        }
        if (!startedInPageMode.current) {
          sheetDragCallbacks.onPanResponderRelease?.(event, gesture);
          return;
        }
        sheetDragRevision.current += 1;
        analytics.gesture('sheet_drag', {direction: 'down', from_snap: 0});
        const shouldLower =
          gesture.dy >= DETAIL_PULL_DOWN_DISTANCE ||
          gesture.vy >= DETAIL_PULL_DOWN_VELOCITY;
        snapTo(snapOffsets[shouldLower ? 1 : 0]);
      },
    });
  }, [
    analytics,
    collapsedOffset,
    sheetDragCallbacks,
    snapOffsets,
    snapTo,
    topOffset,
    translateY,
  ]);
  // iOS는 본문이 튕기며 네이티브 스크롤이 JS 드래그를 취소하므로, 튕긴 거리만큼 시트를 따라 내립니다.
  const followDetailTopPull = (snapIndex: number, distance: number) => {
    sheetDragRevision.current += 1;
    const offset = Math.min(collapsedOffset, snapOffsets[snapIndex] + distance);
    currentOffset.current = offset;
    translateY.setValue(offset);
  };
  const releaseDetailTopPull = (
    snapIndex: number,
    distance: number,
    velocityY: number,
  ) => {
    if (distance <= 0) return;
    analytics.gesture('sheet_drag', {direction: 'down', from_snap: snapIndex});
    const shouldLower =
      distance >= DETAIL_PULL_DOWN_DISTANCE ||
      velocityY <= -DETAIL_PULL_DOWN_VELOCITY;
    snapTo(snapOffsets[shouldLower ? snapIndex + 1 : snapIndex]);
  };

  const toggleSheet = () => {
    analytics.button('toggle_sheet');
    if (activeSnapIndex === 2) {
      snapTo(snapOffsets[1]);
      return;
    }

    if (activeSnapIndex === 0) {
      snapTo(snapOffsets[1]);
      return;
    }

    snapTo(tapDirection === 'up' ? snapOffsets[0] : snapOffsets[2]);
  };

  const expandCollapsedSheet = () => {
    if (activeSnapIndex === 2) {
      snapTo(snapOffsets[1]);
    }
  };

  const handleCollapsedBodyTouchStart = (event: GestureResponderEvent) => {
    if (activeSnapIndex !== 2) return;
    collapsedBodyTouchStart.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    ignoreCollapsedBodyTap.current = false;
  };

  const handleCollapsedBodyTouchEnd = (event: GestureResponderEvent) => {
    const start = collapsedBodyTouchStart.current;
    collapsedBodyTouchStart.current = null;
    if (
      activeSnapIndex === 2 &&
      !ignoreCollapsedBodyTap.current &&
      start !== null &&
      Math.abs(event.nativeEvent.pageY - start.y) < 10 &&
      Math.abs(event.nativeEvent.pageX - start.x) < 10
    ) {
      expandCollapsedSheet();
    }
    ignoreCollapsedBodyTap.current = false;
  };

  const ignoreCollapsedBodyTapOnPressIn = () => {
    ignoreCollapsedBodyTap.current = true;
  };

  const selectPlace = (place: Place, position: number) => {
    pendingResultsScrollOffsetRef.current = resultsScrollOffsetRef.current;
    restoringResultsScrollOffsetRef.current = null;
    isResultsUserScrollingRef.current = false;
    detailEntrySnapIndex.current = activeSnapIndex;
    detailTranslateY.stopAnimation();
    detailTranslateY.setValue(currentOffset.current);
    setSelectedPlace(place);
    if (place.savedPlaceId) {
      const viewContext: SavedPlaceViewContext = {
        placeId: place.id,
        savedPlaceId: place.savedPlaceId,
        placeViewId: uuidv4(),
        source: 'map_search_result',
      };
      captureSavedPlaceSelected(posthog, { ...viewContext, position });
      setSelectedPlaceViewContext(viewContext);
    } else {
      setSelectedPlaceViewContext(null);
    }

    // 핀과 달리 목록은 지도를 움직이지 않으므로, 상세가 열릴 중간 높이 위로 장소를 옮겨 보여줍니다.
    onListPlaceSelect?.(place, sheetHeight - snapOffsets[1]);

    if (activeSnapIndex !== 1) {
      snapTo(snapOffsets[1], detailTranslateY);
    }
  };

  const backToPlaceList = useCallback(() => {
    // If the detail was expanded after it opened from a shorter list sheet,
    // the first back action only restores the detail to that prior height.
    if (activeSnapIndex === 0 && detailEntrySnapIndex.current !== 0) {
      snapTo(snapOffsets[backSnapIndex]);
      return;
    }

    // Commit the retained list's snap in the same render as the route change.
    // A later effect would expose the detail's height, then animate the list.
    const snapIndex = backSnapIndex;
    const offset = [listTopOffset, middleOffset, collapsedOffset][snapIndex];
    translateY.stopAnimation();
    translateY.setValue(offset);
    currentOffset.current = offset;
    setActiveSnapIndex(snapIndex);
    updatePageMode(false);
    setSelectedPlace(null);
    setSelectedPlaceViewContext(null);
  }, [
    activeSnapIndex,
    backSnapIndex,
    collapsedOffset,
    listTopOffset,
    middleOffset,
    snapOffsets,
    snapTo,
    translateY,
    updatePageMode,
  ]);

  useEffect(() => {
    if (backToPlaceListSignal === handledBackToPlaceListSignal.current) {
      return;
    }

    handledBackToPlaceListSignal.current = backToPlaceListSignal;
    backToPlaceList();
  }, [backToPlaceList, backToPlaceListSignal]);

  const handleDelete = useCallback(async () => {
    if (isDeleting || !selectedPlace) {
      return;
    }
    if (onDeleteGuestPlaces) {
      onDeleteGuestPlaces([selectedPlace.id]);
      backToPlaceList();
      return;
    }
    if (!selectedPlace.savedPlaceId) {
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
      await deleteSavedPlaces([selectedPlace.savedPlaceId]);
      trackActionFinished(posthog, 'saved_place_delete', 'success', {
        source: 'map',
      });
      onSavedPlaceDeleted?.(selectedPlace.savedPlaceId);
      backToPlaceList();
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      if (apiError.errorCode === 'CLIENT000_002') {
        try {
          const savedPlaces = await getSavedPlaces();
          const isDeletionConfirmed = !savedPlaces.some(
            savedPlace => savedPlace.id === selectedPlace.savedPlaceId,
          );
          if (isDeletionConfirmed) {
            onSavedPlaceDeleted?.(selectedPlace.savedPlaceId);
            backToPlaceList();
            return;
          }
        } catch {
          // Keep the original timeout error and allow the user to retry.
        }
      }

      trackActionFinished(posthog, 'saved_place_delete', 'failure', {
        source: 'map',
        failure_type: apiError.errorCode,
      });
      setDeleteError(apiError);
      if (
        apiError.errorCode === 'AUTH401_001' ||
        apiError.errorCode === 'AUTH401_002'
      ) {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [
    backToPlaceList,
    isDeleting,
    onAuthenticationRequired,
    onDeleteGuestPlaces,
    onSavedPlaceDeleted,
    posthog,
    selectedPlace,
  ]);

  // 해제에 실패하면 더보기 시트가 없으므로 알림 창으로 알립니다.
  useEffect(() => {
    if (!deleteError) {
      return;
    }
    showAlert('북마크를 해제하지 못했어요', deleteError.message);
    setDeleteError(null);
  }, [deleteError]);

  const swipeCollapsesDetail =
    selectedPlace !== null &&
    activeSnapIndex === 0 &&
    detailEntrySnapIndex.current !== 0;
  const isDetailTopLocked =
    Platform.OS === 'android' && isPageMode && isDetailAtTop;
  isDetailTopLockedRef.current = isDetailTopLocked;
  const renderDetailContent = (snapIndex: number, preview = false) =>
    selectedPlace ? (
      <View
        {...(snapIndex === 2 ? panResponder.panHandlers : {})}
        onResponderStart={handleCollapsedBodyTouchStart}
        onResponderEnd={handleCollapsedBodyTouchEnd}
        style={[
          styles.detailArea,
          {
            height: Math.max(
              0,
              sheetHeight - snapOffsets[snapIndex] - COLLAPSED_HANDLE_HEIGHT,
            ),
          },
        ]}
      >
        <CopyToastProvider bottomOffset={detailBottomOffset + 16}>
          <PlaceDetailContent
            // Keep the detail content mounted across snap changes so its
            // scroll position and header do not jump during expansion.
            key={selectedPlace.id}
            analyticsScreenName="map"
            activeTab={detailTab}
            onTabChange={setDetailTab}
            placeInfo={placeInfo}
            placeBlogs={placeBlogs}
            initialScrollOffset={
              preview ? detailScrollOffset.current : undefined
            }
            onScrollOffsetChange={
              preview
                ? undefined
                : offset => {
                    detailScrollOffset.current = offset;
                    setIsDetailAtTop(offset <= 0);
                  }
            }
            onTopPull={
              Platform.OS === 'ios' && !preview && snapIndex !== 2
                ? distance => followDetailTopPull(snapIndex, distance)
                : undefined
            }
            onTopPullRelease={
              Platform.OS === 'ios' && !preview && snapIndex !== 2
                ? (distance, velocityY) =>
                    releaseDetailTopPull(snapIndex, distance, velocityY)
                : undefined
            }
            contentPanHandlers={
              Platform.OS === 'android' && !preview && snapIndex !== 2
                ? detailPullDownResponder.panHandlers
                : undefined
            }
            onBack={backToPlaceList}
            place={selectedPlace}
            viewContext={selectedPlaceViewContext ?? undefined}
            reels={selectedPlaceReels}
            reelsError={reelsError}
            isReelsLoading={isReelsLoading}
            onRetryReels={loadSelectedPlaceReels}
            onOpenReel={onOpenReel}
            hideBack
            showTitle={false}
            showMetadata={snapIndex !== 2}
            actionsUnderTitle={snapIndex === 2}
            titleInHeader
            onInteractivePressIn={ignoreCollapsedBodyTapOnPressIn}
            onPressFolder={
              onEditPlaceFolders
                ? () => onEditPlaceFolders(selectedPlace)
                : undefined
            }
            onPressDelete={
              canOpenDetailMore
                ? () => handleDelete().catch(() => undefined)
                : undefined
            }
            isInFolder={getPlaceFoldersLabel?.(selectedPlace) === '폴더 수정'}
            isDeleting={isDeleting}
            headerTopInset={0}
            compactHeader
            scrollEnabled={
              snapIndex !== 2 &&
              !(snapIndex === 0 && !preview && isDetailTopLocked)
            }
            scrollViewRef={preview ? undefined : detailScrollRef}
            contentBottomPadding={
              // 상세 시트는 화면 끝까지 내려오므로 하단 안전 영역만큼 띄웁니다.
              snapIndex === 0
                ? Math.max(DETAIL_PAGE_BOTTOM_PADDING, detailBottomOffset + 12)
                : detailBottomOffset + DETAIL_ACTION_BOTTOM_PADDING
            }
          />
        </CopyToastProvider>
      </View>
    ) : null;
  const renderListContent = (
    snapIndex: number,
    preview = false,
    forceBackFolder = false,
  ) => {
    // 일반 상태 복귀는 미리보기를 쓰고, 폴더 복귀는 유지 중인 목록 화면을 씁니다.
    const isPageBackPreview =
      preview && !selectedPlace && snapIndex !== 0 && !hasFolderDetail;
    const showsBackFolder =
      (forceBackFolder || isPageBackPreview) && backFolderHeader !== undefined;
    return (
      <View
        {...(snapIndex === 2 ? panResponder.panHandlers : {})}
        onResponderStart={handleCollapsedBodyTouchStart}
        onResponderEnd={handleCollapsedBodyTouchEnd}
        style={styles.expansionTapArea}
      >
        {showsBackFolder ? backFolderHeader : folderHeader}
        {(showsBackFolder ? backFolderContent : folderContent) ?? (
          <FlatList
            ref={preview ? undefined : resultsListRef}
            contentOffset={
              preview ? { x: 0, y: resultsScrollOffsetRef.current } : undefined
            }
            data={isPageBackPreview ? backPlaces ?? places : places}
            style={styles.resultsScroll}
            contentContainerStyle={[
              styles.results,
              {
                paddingBottom:
                  BOTTOM_TAB_CLEARANCE + listSnapOffsets[snapIndex],
              },
            ]}
            keyExtractor={place => place.id}
            getItemLayout={(_, index) => ({
              length: RESULT_ITEM_HEIGHT,
              offset: RESULT_ITEM_HEIGHT * index,
              index,
            })}
            contentInsetAdjustmentBehavior="never"
            scrollIndicatorInsets={{ bottom: BOTTOM_TAB_CLEARANCE }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={snapIndex !== 2}
            onScrollBeginDrag={event => {
              isResultsUserScrollingRef.current = true;
              restoringResultsScrollOffsetRef.current = null;
              if (!preview)
                recordResultsScroll(event.nativeEvent.contentOffset.y);
            }}
            onScroll={event => {
              if (!preview)
                recordResultsScroll(event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
            onScrollEndDrag={event => {
              if (!preview)
                recordResultsScroll(event.nativeEvent.contentOffset.y);
              isResultsUserScrollingRef.current = false;
            }}
            onMomentumScrollEnd={event => {
              if (!preview)
                recordResultsScroll(event.nativeEvent.contentOffset.y);
              isResultsUserScrollingRef.current = false;
            }}
            onContentSizeChange={preview ? undefined : restoreResultsScroll}
            renderItem={({ item: place, index }) => (
              <View style={styles.result}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${place.name} 상세 보기`}
                  onPress={() => selectPlace(place, index + 1)}
                  onPressIn={ignoreCollapsedBodyTapOnPressIn}
                  style={styles.resultCard}
                >
                  {place.image ? (
                    <Image
                      source={place.image}
                      style={[styles.photo, { width: photoWidth }]}
                    />
                  ) : (
                    <View
                      style={[
                        styles.photo,
                        styles.imagePlaceholder,
                        { width: photoWidth },
                      ]}
                    />
                  )}
                  <View style={styles.resultText}>
                    {getMiddleCategory(place.category) ? (
                      <View style={styles.titleRow}>
                        <Text numberOfLines={1} style={styles.name}>
                          {place.name}
                        </Text>
                        <View style={styles.categoryPill}>
                          <Text style={styles.category}>
                            {getMiddleCategory(place.category)}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text numberOfLines={1} style={styles.name}>
                        {place.name}
                      </Text>
                    )}
                    <Text style={styles.address}>
                      {place.fullAddress || place.address}
                    </Text>
                  </View>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View
                style={[
                  styles.emptyResult,
                  emptyContent ? styles.customEmptyResult : null,
                ]}
              >
                {emptyContent ? (
                  emptyContent
                ) : isVisibleAreaUpdating ? (
                  <Text style={styles.emptyResultText}>
                    현재 지도 영역을 확인하고 있어요.
                  </Text>
                ) : isSavedPlacesLoading ? (
                  <Text style={styles.emptyResultText}>
                    저장한 장소를 불러오고 있어요.
                  </Text>
                ) : savedPlacesLoadFailed ? (
                  <Text style={styles.emptyResultText}>
                    저장한 장소를 불러오지 못했어요.
                  </Text>
                ) : (
                  <FadeInOnChange key={JSON.stringify(emptyState)}>
                    <PlaceResultEmptyMessage emptyState={emptyState} />
                  </FadeInOnChange>
                )}
              </View>
            }
          />
        )}
      </View>
    );
  };
  const listHeight = Math.max(
    COLLAPSED_HANDLE_HEIGHT + COLLAPSED_CONTENT_VISIBLE_HEIGHT,
    pageHeight - bottomTabOffset,
  );
  const listCollapsedOffset =
    listHeight - COLLAPSED_HANDLE_HEIGHT - COLLAPSED_CONTENT_VISIBLE_HEIGHT;
  const listMiddleOffset = Math.min(
    listCollapsedOffset,
    pageHeight * (1 - MIDDLE_VISIBLE_RATIO),
  );
  const listSnapIndex = selectedPlace
    ? detailEntrySnapIndex.current
    : activeSnapIndex;
  const listSnapOffsets = [
    Math.min(listMiddleOffset, listTopOffset),
    listMiddleOffset,
    listCollapsedOffset,
  ];
  const listOffset = listSnapOffsets[listSnapIndex];
  const backOffset = selectedPlace
    ? snapOffsets[backSnapIndex]
    : listSnapOffsets[backSnapIndex];
  const folderListOffset = listSnapOffsets[backSnapIndex];
  const hasFolderDetail =
    backFolderHeader !== undefined && backFolderContent !== undefined;
  const hasStateBack =
    swipeCollapsesDetail ||
    (!selectedPlace &&
      (activeSnapIndex === 0 || (!hasFolderDetail && pageBackAvailable)));
  useLayoutEffect(() => {
    if (!selectedPlace) return;
    // Prepare the real retained destination before it can be revealed. This
    // value stays attached to the list's native view through the entire pop.
    listTranslateY.stopAnimation();
    listTranslateY.setValue(listOffset);
  }, [listOffset, listTranslateY, selectedPlace]);
  const renderListSheet = (preview = false, forceBackFolder = false) => (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: listHeight,
          bottom: bottomTabOffset,
          transform: [
            {
              translateY: preview
                ? forceBackFolder
                  ? folderListOffset
                  : backOffset
                : listTranslateY,
            },
          ],
        },
      ]}
    >
      <View {...panResponder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 결과 펼치기"
          onPress={toggleSheet}
          style={styles.handleArea}
        >
          <View style={styles.pill} />
        </Pressable>
      </View>
      {renderListContent(
        preview ? backSnapIndex : listSnapIndex,
        preview,
        forceBackFolder,
      )}
    </Animated.View>
  );
  const renderDetailSheet = (snapIndex = activeSnapIndex, preview = false) =>
    selectedPlace ? (
      <Animated.View
        style={[
          styles.sheet,
          styles.detailSheet,
          {
            height: sheetHeight,
            transform: [
              { translateY: preview ? snapOffsets[snapIndex] : translateY },
            ],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색 결과 펼치기"
            onPress={toggleSheet}
            style={styles.handleArea}
          >
            <View style={styles.pill} />
          </Pressable>
        </View>
        {renderDetailContent(snapIndex, preview)}
      </Animated.View>
    ) : null;
  return (
    <View style={styles.page}>
      {renderMap?.({
        isDetail: selectedPlace !== null,
        isExpanded,
        place: selectedPlace,
        sheetHeight,
        sheetBottomOffset: selectedPlace ? 0 : bottomTabOffset,
        sheetVisibleHeight: sheetHeight - currentOffset.current,
        translateY,
      })}
      <SwipeBackStack
        transparent={!!renderMap}
        gestureRegion={{ top: backGestureTop, bottom: backGestureBottom }}
        activeKey={
          selectedPlace ? 'detail' : hasFolderDetail ? 'folder-detail' : 'list'
        }
        backKey={
          hasStateBack
            ? 'state-back'
            : selectedPlace
            ? hasFolderDetail
              ? 'folder-detail'
              : 'list'
            : hasFolderDetail
            ? 'list'
            : null
        }
        onSwipeStart={() => refreshBackPreview(revision => revision + 1)}
        transitionKey={`${activeSnapIndex}:${pageBackStateKey}`}
        onBack={() => {
          // The destination is already visible at its target height. Commit
          // that height without starting a second, vertical animation.
          completingPageSwipe.current = true;
          if (selectedPlace) backToPlaceList();
          else if (activeSnapIndex === 0) snapTo(snapOffsets[backSnapIndex]);
          else onPageBack?.();
          completingPageSwipe.current = false;
        }}
        enabled={isActive}
        screens={[
          ...(hasStateBack
            ? [
                {
                  key: 'state-back',
                  content: renderPage(
                    selectedPlace
                      ? renderDetailSheet(backSnapIndex, true)
                      : renderListSheet(true),
                    {
                      isBackPreview: true,
                      clearsSearch: !selectedPlace && activeSnapIndex !== 0,
                      isDetail: selectedPlace !== null,
                      isExpanded: backSnapIndex === 0,
                      place: selectedPlace,
                      sheetHeight: selectedPlace ? sheetHeight : listHeight,
                      sheetBottomOffset: selectedPlace ? 0 : bottomTabOffset,
                      sheetVisibleHeight:
                        (selectedPlace ? sheetHeight : listHeight) - backOffset,
                      translateY: backOffset,
                    },
                  ),
                },
              ]
            : []),
          {
            key: 'list',
            content: renderPage(
              renderListSheet(hasFolderDetail, hasFolderDetail),
              {
                isBackPreview: hasFolderDetail,
                isDetail: false,
                isExpanded:
                  (hasFolderDetail ? backSnapIndex : listSnapIndex) === 0,
                place: null,
                sheetHeight: listHeight,
                sheetBottomOffset: bottomTabOffset,
                sheetVisibleHeight: hasFolderDetail
                  ? listHeight - folderListOffset
                  : selectedPlace
                  ? listHeight - listOffset
                  : sheetHeight - currentOffset.current,
                translateY: hasFolderDetail ? folderListOffset : listTranslateY,
              },
            ),
          },
          ...(hasFolderDetail
            ? [
                {
                  key: 'folder-detail',
                  content: renderPage(renderListSheet(), {
                    isDetail: false,
                    isExpanded: listSnapIndex === 0,
                    place: null,
                    sheetHeight: listHeight,
                    sheetBottomOffset: bottomTabOffset,
                    sheetVisibleHeight: sheetHeight - currentOffset.current,
                    translateY: listTranslateY,
                  }),
                },
              ]
            : []),
          ...(selectedPlace
            ? [
                {
                  key: 'detail',
                  content: renderPage(renderDetailSheet(), {
                    isDetail: true,
                    isExpanded,
                    place: selectedPlace,
                    sheetHeight,
                    sheetBottomOffset: 0,
                    sheetVisibleHeight: sheetHeight - currentOffset.current,
                    translateY,
                  }),
                },
              ]
            : []),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  detailSheet: { bottom: 0 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  detailArea: {
    minHeight: 0,
    overflow: 'hidden',
  },
  expansionTapArea: {
    flex: 1,
  },
  pill: {
    alignSelf: 'center',
    width: 97,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    opacity: 0.15,
    marginBottom: 7,
  },
  handleArea: {
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 2,
    minHeight: COLLAPSED_HANDLE_HEIGHT,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  results: {
    flexGrow: 1,
    paddingHorizontal: 13,
  },
  resultsScroll: {
    flex: 1,
    minHeight: 0,
  },
  result: {
    height: RESULT_ITEM_HEIGHT,
    paddingVertical: 12,
  },
  emptyResult: {
    paddingTop: 34,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyMessage: {
    alignItems: 'center',
  },
  // 화면이 넘긴 빈 상태(예: 빈 폴더)는 위 헤더에 붙여 보여줍니다.
  customEmptyResult: {
    paddingTop: 12,
  },
  emptyIllustration: {
    width: 132,
    height: 96,
    borderRadius: 18,
    transform: [{ translateX: -8 }],
    marginBottom: 12,
  },
  // 빈 상자 일러스트(96)는 위 투명 여백 약 16을 빼면 그림 높이가 약 80입니다.
  // 여백 없는 일러스트도 그림 높이 80에 원본 비율로 맞추고, 위에 16을 두어 그림과 제목 위치를 같게 합니다.
  searchEmptyIllustration: {
    width: 75,
    height: 80,
    marginTop: 16,
    marginBottom: 12,
  },
  areaEmptyIllustration: {
    width: 92,
    height: 80,
    marginTop: 16,
    marginBottom: 12,
  },
  categoryEmptyIllustration: {
    width: 95,
    height: 80,
    marginTop: 16,
    marginBottom: 12,
  },
  emptyResultTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  emptyResultText: {
    marginTop: 6,
    fontSize: 14,
    color: '#8e8e93',
    textAlign: 'center',
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 92,
  },
  resultText: {
    flex: 1,
    paddingLeft: 14,
    paddingTop: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  categoryPill: {
    borderWidth: 1.5,
    borderColor: '#C9C9CE',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 8,
  },
  category: {
    color: '#77777D',
    fontSize: 12,
  },
  address: {
    fontSize: 12,
    color: '#8e8e93',
    lineHeight: 18,
    marginTop: 7,
  },
  photo: {
    height: 92,
    borderRadius: 4,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    backgroundColor: '#F1F3FB',
  },
});
