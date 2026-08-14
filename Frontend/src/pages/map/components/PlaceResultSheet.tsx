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

import { getPlaceReels } from '../../../entities/info/api';
import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import { MAP_SEARCH_BAR_HEIGHT, MAP_SEARCH_BAR_TOP_GAP } from './MapSearchBar';
import { CopyToastProvider } from '../../place-detail/components/CopyToast';
import { PlaceDetailContent } from '../../place-detail/components/PlaceDetailContent';
import { PlaceMapButton } from '../../place-detail/components/PlaceMapButton';

type PlaceResultSheetProps = {
  places: Place[];
  height: number;
  topInset?: number;
  onExpandedChange?: (isExpanded: boolean) => void;
  onVisibleHeightChange?: (height: number) => void;
  collapseSignal?: number;
  onDetailViewChange?: (isDetailView: boolean) => void;
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
  height,
  topInset = 0,
  onExpandedChange,
  onVisibleHeightChange,
  collapseSignal = 0,
  onDetailViewChange,
}: PlaceResultSheetProps) {
  const { width: windowWidth } = useWindowDimensions();
  const sheetHeight = Math.max(COLLAPSED_SHEET_HEIGHT, height);
  const photoWidth = (windowWidth - 26) / 4;
  const collapsedOffset = sheetHeight - COLLAPSED_SHEET_HEIGHT;
  const middleOffset = Math.min(
    collapsedOffset,
    sheetHeight * (1 - MIDDLE_SHEET_HEIGHT_RATIO),
  );
  const snapOffsets = useMemo(
    () => [0, middleOffset, collapsedOffset],
    [collapsedOffset, middleOffset],
  );
  // Start compact so the sheet can be dragged both upward and downward.
  const translateY = useRef(new Animated.Value(collapsedOffset)).current;
  const currentOffset = useRef(collapsedOffset);
  const dragStartOffset = useRef(collapsedOffset);
  const startedInPageMode = useRef(false);
  const handledCollapseSignal = useRef(collapseSignal);
  const isPageModeRef = useRef(false);
  const [activeSnapIndex, setActiveSnapIndex] = useState(2);
  const [isPageMode, setIsPageMode] = useState(false);
  const [tapDirection, setTapDirection] = useState<'up' | 'down'>('up');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceReels, setSelectedPlaceReels] = useState<PlaceReel[]>([]);
  const [reelsError, setReelsError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(false);
  const isExpanded = activeSnapIndex === 0;
  const hiddenSheetHeight = isPageMode ? 0 : snapOffsets[activeSnapIndex];
  const listBottomClearance = BOTTOM_TAB_CLEARANCE + hiddenSheetHeight;
  const expandedHeaderHeight =
    topInset +
    MAP_SEARCH_BAR_TOP_GAP +
    MAP_SEARCH_BAR_HEIGHT +
    EXPANDED_RESULTS_TOP_GAP;
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
      onVisibleHeightChange?.(sheetHeight - nearestOffset);
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
      onVisibleHeightChange,
      sheetHeight,
      snapOffsets,
      translateY,
      updatePageMode,
    ],
  );

  useEffect(() => {
    // Keep the selected snap point when device rotation changes the sheet size.
    translateY.stopAnimation(value => {
      const nearestSnapIndex = snapOffsets.reduce(
        (closestIndex, offset, index) =>
          Math.abs(offset - value) < Math.abs(snapOffsets[closestIndex] - value)
            ? index
            : closestIndex,
        0,
      );
      currentOffset.current = snapOffsets[nearestSnapIndex];
      setActiveSnapIndex(nearestSnapIndex);
      updatePageMode(nearestSnapIndex === 0);
      onVisibleHeightChange?.(sheetHeight - snapOffsets[nearestSnapIndex]);
      translateY.setValue(currentOffset.current);
    });
  }, [
    onVisibleHeightChange,
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
    setSelectedPlace(place);

    if (activeSnapIndex === 2) {
      snapTo(snapOffsets[1]);
    }
  };

  const backToPlaceList = () => {
    setSelectedPlace(null);
  };

  return (
    <Animated.View
      {...panResponder.panHandlers}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색 결과 펼치기"
            onPress={toggleSheet}
            style={styles.handleArea}
          >
            <View style={styles.pill} />
          </Pressable>
        ) : null}
      </View>
      {selectedPlace ? (
        <CopyToastProvider>
          <PlaceDetailContent
            key={selectedPlace.id}
            onBack={backToPlaceList}
            place={selectedPlace}
            reels={selectedPlaceReels}
            reelsError={reelsError}
            isReelsLoading={isReelsLoading}
            onRetryReels={loadSelectedPlaceReels}
            headerTopInset={topInset}
            stickyHeaderTopInset={topInset}
            scrollEnabled={isPageMode}
            contentBottomPadding={
              isPageMode
                ? DETAIL_PAGE_BOTTOM_PADDING
                : DETAIL_INLINE_BOTTOM_PADDING
            }
          />
          {isPageMode && selectedPlace.placeUrl ? (
            <PlaceMapButton url={selectedPlace.placeUrl} />
          ) : null}
        </CopyToastProvider>
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
          scrollEnabled={isPageMode}
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
                현재 지도 영역에 저장한 장소가 없어요.
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
    paddingBottom: 17,
    minHeight: 48,
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
