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
  Alert,
  Animated,
  FlatList,
  LayoutAnimation,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { usePostHog } from 'posthog-react-native';
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

type PlaceResultSheetProps = {
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
  isSearchActive?: boolean;
  hasSavedPlaces?: boolean;
  /** 목록 위에 고정되는 폴더 전환/폴더 상세 헤더입니다. */
  folderHeader?: React.ReactNode;
  /** 지정하면 장소 목록 대신 이 내용을 보여줍니다(폴더 목록). */
  folderContent?: React.ReactNode;
  /** 장소 목록이 비었을 때 기본 안내 대신 보여줄 내용입니다. */
  emptyContent?: React.ReactNode;
  isSavedPlacesLoading?: boolean;
  savedPlacesLoadFailed?: boolean;
  isVisibleAreaUpdating?: boolean;
  translateY?: Animated.Value;
  topInset?: number;
  bottomTabOffset?: number;
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
  isSearchActive = false,
  hasSavedPlaces = false,
  folderHeader,
  folderContent,
  emptyContent,
  isSavedPlacesLoading = false,
  savedPlacesLoadFailed = false,
  isVisibleAreaUpdating = false,
  translateY: sharedTranslateY,
  topInset = 0,
  bottomTabOffset = 0,
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
    (selectedPlace ? bottomTabOffset : 0);
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
  const detailScrollOffset = useRef(0);
  const [, refreshBackPreview] = useState(0);
  const dragStartSnapIndex = useRef(activeSnapIndex);
  const [isPageMode, setIsPageMode] = useState(false);
  const [tapDirection, setTapDirection] = useState<'up' | 'down'>('up');
  const isExpanded = activeSnapIndex === 0;
  const backGestureTop = Math.max(0, snapOffsets[activeSnapIndex]);
  useLayoutEffect(() => {
    onBackGestureRegionChange?.({
      top: backGestureTop,
      bottom: bottomTabOffset,
    });
  }, [backGestureTop, bottomTabOffset, onBackGestureRegionChange]);
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
  }, [selectedPlace]);

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
    };
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !isPageModeRef.current &&
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !isPageModeRef.current &&
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
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
            snapTo(isExpanded ? collapsedOffset : topOffset);
            return;
          }

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

  const toggleSheet = () => {
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
    selectedPlace,
  ]);

  // 삭제 전에 보관함과 같은 문구로 한 번 더 확인합니다.
  const confirmDelete = useCallback(() => {
    if (isDeleting || !selectedPlace) {
      return;
    }
    Alert.alert(
      '선택한 장소를 삭제할까요?',
      '선택한 1곳의 장소가 보관함에서 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            handleDelete().catch(() => undefined);
          },
        },
      ],
    );
  }, [handleDelete, isDeleting, selectedPlace]);

  // 삭제에 실패하면 더보기 시트가 없으므로 알림 창으로 알립니다.
  useEffect(() => {
    if (!deleteError) {
      return;
    }
    Alert.alert('삭제하지 못했어요', deleteError.message);
    setDeleteError(null);
  }, [deleteError]);

  const swipeCollapsesDetail =
    selectedPlace !== null &&
    activeSnapIndex === 0 &&
    detailEntrySnapIndex.current !== 0;
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
              sheetHeight -
                snapOffsets[snapIndex] -
                COLLAPSED_HANDLE_HEIGHT,
            ),
          },
        ]}
      >
        <CopyToastProvider bottomOffset={bottomTabOffset + 16}>
          <PlaceDetailContent
            // Keep the detail content mounted across snap changes so its
            // scroll position and header do not jump during expansion.
            key={selectedPlace.id}
            activeTab={detailTab}
            onTabChange={setDetailTab}
            initialScrollOffset={
              preview ? detailScrollOffset.current : undefined
            }
            onScrollOffsetChange={
              preview
                ? undefined
                : offset => {
                    detailScrollOffset.current = offset;
                  }
            }
            onBack={backToPlaceList}
            place={selectedPlace}
            viewContext={selectedPlaceViewContext ?? undefined}
            reels={selectedPlaceReels}
            reelsError={reelsError}
            isReelsLoading={isReelsLoading}
            onRetryReels={loadSelectedPlaceReels}
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
            onPressDelete={canOpenDetailMore ? confirmDelete : undefined}
            isInFolder={getPlaceFoldersLabel?.(selectedPlace) === '폴더 수정'}
            isDeleting={isDeleting}
            headerTopInset={0}
            compactHeader
            scrollEnabled={snapIndex !== 2}
            contentBottomPadding={
              snapIndex === 0
                ? Math.max(DETAIL_PAGE_BOTTOM_PADDING, bottomTabOffset + 12)
                : DETAIL_ACTION_BOTTOM_PADDING
            }
          />
        </CopyToastProvider>
      </View>
    ) : null;
  const renderListContent = (snapIndex: number, preview = false) => (
    <View
      {...(snapIndex === 2 ? panResponder.panHandlers : {})}
      onResponderStart={handleCollapsedBodyTouchStart}
      onResponderEnd={handleCollapsedBodyTouchEnd}
      style={styles.expansionTapArea}
    >
      {folderHeader}
      {folderContent ?? (
        <FlatList
          ref={preview ? undefined : resultsListRef}
          contentOffset={
            preview ? { x: 0, y: resultsScrollOffsetRef.current } : undefined
          }
          data={
            preview && !selectedPlace && snapIndex !== 0
              ? backPlaces ?? places
              : places
          }
          style={styles.resultsScroll}
          contentContainerStyle={[
            styles.results,
            {
              paddingBottom: BOTTOM_TAB_CLEARANCE + listSnapOffsets[snapIndex],
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
              ) : isSearchActive ? (
                <>
                  <Text style={styles.emptyResultTitle}>
                    검색 결과가 없어요
                  </Text>
                  <Text style={styles.emptyResultText}>
                    다른 키워드로 다시 검색해보세요.
                  </Text>
                </>
              ) : !hasSavedPlaces ? (
                <>
                  <Image
                    source={require('../../../assets/illustrations/dami-empty-box-small-cropped.png')}
                    style={styles.emptyIllustration}
                  />
                  <Text style={styles.emptyResultTitle}>
                    아직 저장한 장소가 없어요
                  </Text>
                  <Text style={styles.emptyResultText}>
                    장소를 저장하면 지도에서 확인할 수 있어요.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyResultTitle}>
                    이 지도 영역에 저장한 장소가 없어요
                  </Text>
                  <Text style={styles.emptyResultText}>
                    지도를 움직여 다른 곳도 확인해보세요.
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
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
  const hasStateBack =
    swipeCollapsesDetail ||
    (!selectedPlace && (activeSnapIndex === 0 || pageBackAvailable));
  useLayoutEffect(() => {
    if (!selectedPlace) return;
    // Prepare the real retained destination before it can be revealed. This
    // value stays attached to the list's native view through the entire pop.
    listTranslateY.stopAnimation();
    listTranslateY.setValue(listOffset);
  }, [listOffset, listTranslateY, selectedPlace]);
  const renderListSheet = (preview = false) => (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: listHeight,
          bottom: bottomTabOffset,
          transform: [
            {
              translateY: preview ? backOffset : listTranslateY,
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
      {renderListContent(preview ? backSnapIndex : listSnapIndex, preview)}
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
        gestureRegion={{ top: backGestureTop, bottom: bottomTabOffset }}
        activeKey={selectedPlace ? 'detail' : 'list'}
        backKey={hasStateBack ? 'state-back' : selectedPlace ? 'list' : null}
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
            content: renderPage(renderListSheet(), {
              isDetail: false,
              isExpanded: listSnapIndex === 0,
              place: null,
              sheetHeight: listHeight,
              sheetBottomOffset: bottomTabOffset,
              sheetVisibleHeight: selectedPlace
                ? listHeight - listOffset
                : sheetHeight - currentOffset.current,
              translateY: listTranslateY,
            }),
          },
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
