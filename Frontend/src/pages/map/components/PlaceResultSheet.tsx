import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { Place } from '../../../entities/place/types';

type PlaceResultSheetProps = {
  places: Place[];
  height: number;
  onOpenDetail: (place: Place) => void;
};

const COLLAPSED_HEIGHT = 112;
const MIDDLE_SHEET_HEIGHT_RATIO = 0.5;

export function PlaceResultSheet({
  places,
  height,
  onOpenDetail,
}: PlaceResultSheetProps) {
  const { width: windowWidth } = useWindowDimensions();
  const sheetHeight = Math.max(COLLAPSED_HEIGHT, height);
  const photoWidth = (windowWidth - 26) / 4;
  const collapsedOffset = sheetHeight - COLLAPSED_HEIGHT;
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
  const [activeSnapIndex, setActiveSnapIndex] = useState(2);
  const [tapDirection, setTapDirection] = useState<'up' | 'down'>('up');
  const isExpanded = activeSnapIndex === 0;

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
      Animated.spring(translateY, {
        toValue: nearestOffset,
        useNativeDriver: true,
        damping: 22,
        stiffness: 240,
        mass: 0.7,
      }).start();
    },
    [activeSnapIndex, collapsedOffset, snapOffsets, translateY],
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
      translateY.setValue(currentOffset.current);
    });
  }, [snapOffsets, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only the header claims vertical drags. The result list keeps its own
        // ScrollView gesture so users can read all results.
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dy) > 4 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          translateY.stopAnimation(value => {
            dragStartOffset.current = value;
            currentOffset.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const nextOffset = Math.max(
            0,
            Math.min(collapsedOffset, dragStartOffset.current + gesture.dy),
          );
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
          snapTo(releasedOffset);
        },
        onPanResponderTerminate: () => snapTo(currentOffset.current),
      }),
    [collapsedOffset, isExpanded, snapTo, translateY],
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

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: sheetHeight, transform: [{ translateY }] },
      ]}
    >
      <View {...panResponder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded ? '검색 결과 접기' : '검색 결과 펼치기'
          }
          onPress={toggleSheet}
          style={styles.handleArea}
        >
          <View style={styles.pill} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.results}
        showsVerticalScrollIndicator={false}
        scrollEnabled={activeSnapIndex !== 2}
      >
        {places.map(place => (
          <View key={place.id} style={styles.result}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${place.name} 상세 보기`}
              onPress={() => onOpenDetail(place)}
              style={styles.resultTop}
            >
              <View style={styles.resultText}>
                <Text style={styles.name}>{place.name}</Text>
                <Text style={styles.address}>{place.fullAddress}</Text>
              </View>
              <View style={styles.favoriteButton}>
                <Text style={styles.heart}>♡</Text>
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
        ))}
      </ScrollView>
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
    paddingHorizontal: 13,
    paddingBottom: 24,
  },
  result: {
    paddingTop: 10,
    paddingBottom: 18,
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
  heart: {
    fontSize: 25,
    color: '#dbe0f9',
    lineHeight: 27,
  },
  favoriteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStrip: {
    flexDirection: 'row',
    height: 118,
    borderRadius: 18,
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
