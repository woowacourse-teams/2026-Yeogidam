import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

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
import { MAP_SEARCH_BAR_HEIGHT, MAP_SEARCH_BAR_TOP_GAP } from './MapSearchBar';
import { CopyToastProvider } from '../../place-detail/components/CopyToast';
import { PlaceDetailActionSheet } from '../../place-detail/components/PlaceDetailActionSheet';
import { PlaceDetailContent } from '../../place-detail/components/PlaceDetailContent';
import { PlaceMapButton } from '../../place-detail/components/PlaceMapButton';

type PlaceResultSheetProps = {
  places: Place[];
  isSearchActive?: boolean;
  isVisibleAreaUpdating?: boolean;
  height: number;
  topInset?: number;
  bottomTabOffset?: number;
  onExpandedChange?: (isExpanded: boolean) => void;
  onVisibleHeightChange?: (height: number) => void;
  collapseSignal?: number;
  expandSignal?: number;
  openPlace?: Place | null;
  openPlaceId?: string;
  openPlaceSignal?: number;
  onPlaceSelected?: (place: Place) => void;
  onPlaceDetailBack?: () => void;
  onDetailViewChange?: (isDetailView: boolean) => void;
  onAuthenticationRequired?: () => void;
  onSavedPlaceDeleted?: (savedPlaceId: string) => void;
};

export const COLLAPSED_SHEET_HEIGHT = 48;
const MIDDLE_SHEET_HEIGHT_RATIO = 0.5;
const PAGE_MODE_TRIGGER_OFFSET = 72;
const BOTTOM_TAB_CLEARANCE = 92;
const EXPANDED_RESULTS_TOP_GAP = 16;
const DETAIL_INLINE_BOTTOM_PADDING = 24;
const DETAIL_PAGE_BOTTOM_PADDING = 100;

export function PlaceResultSheet({
  places,
  isSearchActive = false,
  isVisibleAreaUpdating = false,
  height,
  topInset = 0,
  bottomTabOffset = 0,
  onExpandedChange,
  onVisibleHeightChange,
  collapseSignal = 0,
  expandSignal = 0,
  openPlace,
  openPlaceId,
  openPlaceSignal = 0,
  onPlaceSelected,
  onPlaceDetailBack,
  onDetailViewChange,
  onAuthenticationRequired,
  onSavedPlaceDeleted,
}: PlaceResultSheetProps) {
  const { width: windowWidth } = useWindowDimensions();
  const sheetHeight = Math.max(COLLAPSED_SHEET_HEIGHT, height);
  const photoWidth = (windowWidth - 26) / 4;
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceReels, setSelectedPlaceReels] = useState<PlaceReel[]>([]);
  const [reelsError, setReelsError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(false);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);
  const collapsedOffset = sheetHeight - COLLAPSED_SHEET_HEIGHT;
  const middleOffset = Math.min(
    collapsedOffset,
    sheetHeight * (1 - MIDDLE_SHEET_HEIGHT_RATIO),
  );
  // When the tab bar disappears for a selected place, the sheet grows down to
  // the bottom of the screen. Offset its middle snap by half that growth so
  // the top edge (and its drag handle) remains in the same screen position.
  const detailMiddleOffset = selectedPlace
    ? Math.max(0, middleOffset - bottomTabOffset / 2)
    : middleOffset;
  const snapOffsets = useMemo(
    () => [0, detailMiddleOffset, collapsedOffset],
    [collapsedOffset, detailMiddleOffset],
  );
  // Start compact so the sheet can be dragged both upward and downward.
  const translateY = useRef(new Animated.Value(collapsedOffset)).current;
  const currentOffset = useRef(collapsedOffset);
  const dragStartOffset = useRef(collapsedOffset);
  const startedInPageMode = useRef(false);
  const previousSheetHeight = useRef(sheetHeight);
  const handledCollapseSignal = useRef(collapseSignal);
  const handledExpandSignal = useRef(expandSignal);
  const handledOpenPlaceSignal = useRef(openPlaceSignal);
  const isPageModeRef = useRef(false);
  const [activeSnapIndex, setActiveSnapIndex] = useState(2);
  const [isPageMode, setIsPageMode] = useState(false);
  const [tapDirection, setTapDirection] = useState<'up' | 'down'>('up');
  const isExpanded = activeSnapIndex === 0;
  const hiddenSheetHeight = isPageMode ? 0 : snapOffsets[activeSnapIndex];
  const listBottomClearance = BOTTOM_TAB_CLEARANCE + hiddenSheetHeight;
  const detailVisibleHeight = Math.max(
    0,
    sheetHeight - hiddenSheetHeight - (isPageMode ? 0 : COLLAPSED_SHEET_HEIGHT),
  );
  const expandedHeaderHeight =
    topInset +
    MAP_SEARCH_BAR_TOP_GAP +
    MAP_SEARCH_BAR_HEIGHT +
    EXPANDED_RESULTS_TOP_GAP;

  const reportVisibleHeight = useCallback(
    (offset: number) => {
      onVisibleHeightChange?.(sheetHeight - offset);
    },
    [onVisibleHeightChange, sheetHeight],
  );
  useEffect(() => {
    onDetailViewChange?.(selectedPlace !== null);
  }, [onDetailViewChange, selectedPlace]);

  const loadSelectedPlaceReels = useCallback(async () => {
    if (!selectedPlace) {
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
  }, [selectedPlace]);

  useEffect(() => {
    loadSelectedPlaceReels();
  }, [loadSelectedPlaceReels]);

  const updatePageMode = useCallback(
    (nextIsPageMode: boolean) => {
      if (isPageModeRef.current === nextIsPageMode) {
        return;
      }

      isPageModeRef.current = nextIsPageMode;
      setIsPageMode(nextIsPageMode);
      onExpandedChange?.(nextIsPageMode);
    },
    [onExpandedChange],
  );

  const snapTo = useCallback(
    (nextOffset: number) => {
      const clampedOffset = Math.max(0, Math.min(collapsedOffset, nextOffset));
      const nearestSnapIndex = snapOffsets.reduce(
        (closestIndex, offset, index) =>
          Math.abs(offset - clampedOffset) <
          Math.abs(snapOffsets[closestIndex] - clampedOffset)
            ? index
            : closestIndex,
        0,
      );
      const nearestOffset = snapOffsets[nearestSnapIndex];

      currentOffset.current = nearestOffset;
      if (nearestSnapIndex < activeSnapIndex) {
        setTapDirection('up');
      } else if (nearestSnapIndex > activeSnapIndex) {
        setTapDirection('down');
      }
      setActiveSnapIndex(nearestSnapIndex);
      updatePageMode(nearestSnapIndex === 0);
      reportVisibleHeight(nearestOffset);
      Animated.spring(translateY, {
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
      snapOffsets,
      translateY,
      updatePageMode,
    ],
  );

  useEffect(() => {
    // Keep the selected snap point when device rotation changes the sheet size.
    // `snapOffsets` also changes when a place is selected because the detail
    // sheet has its own middle offset. That must not reset a marker-selected
    // detail sheet back to its collapsed position.
    if (previousSheetHeight.current === sheetHeight) {
      return;
    }

    previousSheetHeight.current = sheetHeight;
    // `currentOffset` is updated before a snap animation begins. Prefer that
    // intended snap over the instantaneous animated value: when opening a
    // detail sheet also changes its height, the animation can still be near
    // the old collapsed position at this point.
    const offsetToPreserve = currentOffset.current;
    translateY.stopAnimation(() => {
      const nearestSnapIndex = snapOffsets.reduce(
        (closestIndex, offset, index) =>
          Math.abs(offset - offsetToPreserve) <
          Math.abs(snapOffsets[closestIndex] - offsetToPreserve)
            ? index
            : closestIndex,
        0,
      );
      currentOffset.current = snapOffsets[nearestSnapIndex];
      setActiveSnapIndex(nearestSnapIndex);
      updatePageMode(nearestSnapIndex === 0);
      reportVisibleHeight(snapOffsets[nearestSnapIndex]);
      translateY.setValue(currentOffset.current);
    });
  }, [
    reportVisibleHeight,
    sheetHeight,
    snapOffsets,
    translateY,
    updatePageMode,
  ]);

  useEffect(() => {
    if (collapseSignal === handledCollapseSignal.current) {
      return;
    }

    handledCollapseSignal.current = collapseSignal;
    if (isPageMode) {
      snapTo(snapOffsets[1]);
    }
  }, [collapseSignal, isPageMode, snapOffsets, snapTo]);

  useEffect(() => {
    if (expandSignal === handledExpandSignal.current) {
      return;
    }

    handledExpandSignal.current = expandSignal;
    setSelectedPlace(null);
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
    setSelectedPlace(place);
    snapTo(snapOffsets[1]);
  }, [openPlace, openPlaceId, openPlaceSignal, places, snapOffsets, snapTo]);

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
          startedInPageMode.current = isPageModeRef.current;
          translateY.stopAnimation(value => {
            dragStartOffset.current = value;
            currentOffset.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          let nextOffset = Math.max(
            0,
            Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
          );

          // Once the sheet reaches the search bar, it becomes a page and its
          // actual animated position is reset as well. Keeping both positions
          // aligned makes repeated open/close drags reliable.
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

          currentOffset.current = nextOffset;
          translateY.setValue(nextOffset);
        },
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dy) < 3) {
            snapTo(isExpanded ? collapsedOffset : 0);
            return;
          }

          const releasedOffset = Math.max(
            0,
            Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
          );
          if (
            startedInPageMode.current &&
            releasedOffset > PAGE_MODE_TRIGGER_OFFSET
          ) {
            snapTo(snapOffsets[1]);
            return;
          }

          snapTo(releasedOffset);
        },
        onPanResponderTerminate: () => snapTo(currentOffset.current),
      }),
    [
      collapsedOffset,
      isExpanded,
      snapOffsets,
      snapTo,
      translateY,
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

  const selectPlace = (place: Place) => {
    onPlaceSelected?.(place);
    setSelectedPlace(place);

    if (activeSnapIndex === 2) {
      snapTo(snapOffsets[1]);
    }
  };

  const backToPlaceList = useCallback(() => {
    setIsActionSheetVisible(false);
    onPlaceDetailBack?.();
    setSelectedPlace(null);
  }, [onPlaceDetailBack]);

  const handleDelete = useCallback(async () => {
    if (isDeleting || !selectedPlace) {
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
      if (apiError.errorCode === 'AUTH401_001' || apiError.errorCode === 'AUTH401_002') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [
    backToPlaceList,
    isDeleting,
    onAuthenticationRequired,
    onSavedPlaceDeleted,
    selectedPlace,
  ]);

  return (
    <Animated.View
      style={[
        styles.sheet,
        isPageMode && styles.pageSheet,
        {
          height: sheetHeight,
          transform: [{ translateY }],
        },
      ]}
    >
      <View>
        {isPageMode && !selectedPlace ? (
          <View style={{ height: expandedHeaderHeight }} />
        ) : !isPageMode ? (
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
        ) : null}
      </View>
      {selectedPlace ? (
        <View style={[styles.detailArea, { height: detailVisibleHeight }]}>
          <CopyToastProvider>
            <PlaceDetailContent
              key={selectedPlace.id}
              onBack={backToPlaceList}
              place={selectedPlace}
              reels={selectedPlaceReels}
              reelsError={reelsError}
              isReelsLoading={isReelsLoading}
              onRetryReels={loadSelectedPlaceReels}
              onPressMore={() => {
                setDeleteError(null);
                setIsActionSheetVisible(true);
              }}
              // A partially-open sheet is already below the status area, so
              // reserving the map's safe-area inset here creates a large,
              // unnecessary gap above the detail header. Keep that inset only
              // when the sheet becomes a full-screen page.
              headerTopInset={isPageMode ? topInset : 0}
              stickyHeaderTopInset={isPageMode ? topInset : 0}
              compactHeader={!isPageMode}
              scrollEnabled={activeSnapIndex !== 2}
              contentBottomPadding={
                isPageMode
                  ? DETAIL_PAGE_BOTTOM_PADDING
                  : DETAIL_INLINE_BOTTOM_PADDING
              }
            />
            {isPageMode && selectedPlace.placeUrl ? (
              <PlaceMapButton url={selectedPlace.placeUrl} />
            ) : null}
            <PlaceDetailActionSheet
              visible={isActionSheetVisible}
              onClose={() => {
                setDeleteError(null);
                setIsActionSheetVisible(false);
              }}
              onDelete={handleDelete}
              isDeleting={isDeleting}
              deleteError={deleteError}
            />
          </CopyToastProvider>
        </View>
      ) : (
        <FlatList
          key={`results-${activeSnapIndex}-${isPageMode ? 'page' : 'sheet'}`}
          data={places}
          style={styles.resultsScroll}
          contentContainerStyle={[
            styles.results,
            { paddingBottom: listBottomClearance },
          ]}
          keyExtractor={place => place.id}
          contentInsetAdjustmentBehavior="never"
          scrollIndicatorInsets={{ bottom: BOTTOM_TAB_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={activeSnapIndex !== 2}
          renderItem={({ item: place }) => (
            <View style={styles.result}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${place.name} 상세 보기`}
                onPress={() => selectPlace(place)}
                style={styles.resultTop}
              >
                <View style={styles.resultText}>
                  <Text style={styles.name}>{place.name}</Text>
                  <Text style={styles.address}>{place.fullAddress}</Text>
                </View>
              </Pressable>
              <ScrollView
                horizontal
                directionalLockEnabled
                nestedScrollEnabled
                scrollEventThrottle={16}
                contentContainerStyle={styles.photoStrip}
                showsHorizontalScrollIndicator={false}
              >
                {(
                  place.images ?? [
                    place.image,
                    place.image,
                    place.image,
                    place.image,
                  ]
                ).map((image, index) => (
                  <Image
                    key={index}
                    source={image}
                    style={[styles.photo, { width: photoWidth }]}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyResult}>
              <Text style={styles.emptyResultText}>
                {isVisibleAreaUpdating
                  ? '현재 지도 영역을 확인하고 있어요.'
                  : isSearchActive
                  ? '검색 결과 없습니다.'
                  : '현재 지도 영역에 저장한 장소가 없어요.'}
              </Text>
            </View>
          }
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  pageSheet: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  detailArea: {
    minHeight: 0,
    overflow: 'hidden',
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
    minHeight: 28,
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
    paddingTop: 9,
    paddingBottom: 15,
  },
  emptyResult: {
    paddingTop: 34,
    alignItems: 'center',
  },
  emptyResultText: {
    fontSize: 14,
    color: '#8e8e93',
  },
  resultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  resultText: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  address: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 3,
  },
  photoStrip: {
    flexDirection: 'row',
    height: 118,
    borderRadius: 14,
    overflow: 'hidden',
  },
  photo: {
    width: 96,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
    resizeMode: 'cover',
  },
});
