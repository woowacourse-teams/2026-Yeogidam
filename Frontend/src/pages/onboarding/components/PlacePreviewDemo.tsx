import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import {
  SEARCH_BAR_HEIGHT,
  SEARCH_BAR_TOP_GAP,
  SearchBar,
} from '../../../components/SearchBar';
import type { StepMediaFrame } from '../../../components/StepPager';
import { ONBOARDING_PLACES } from '../../../entities/onboarding/data';
import { SavedPlaceGrid } from '../../saved-places/components/SavedPlaceGrid';

// 실제 화면 크기로 그린 뒤 프레임에 맞게 줄인다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = Math.round((CANVAS_WIDTH * 500) / 300);
// 온보딩 장소 핀이 보이는 지도 배경, 1047x1502
const GUEST_MAP_IMAGE = require('../../../assets/onboarding/guest-map-centered.png');
const GUEST_MAP_HEIGHT = Math.round((CANVAS_WIDTH * 1502) / 1047);
const SHEET_HEIGHT = 262;
const SHEET_PLACES = ONBOARDING_PLACES.slice(0, 2);
const LIBRARY_SCROLL = 150;

const noop = () => undefined;

function getMiddleCategory(category?: string) {
  return category?.split('>')[1]?.trim();
}

// 보관함에 모인 장소를 보여준 뒤 지도와 장소 시트로 넘어가는 애니메이션
export function PlacePreviewDemo({ width, height }: StepMediaFrame) {
  const scroll = useRef(new Animated.Value(0)).current;
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const snap = (value: Animated.Value) =>
      Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(250),
        Animated.timing(scroll, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.delay(200),
        Animated.timing(mapOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.parallel([
          // 지도 크기는 고정하고 장소 시트를 읽을 시간을 남긴다.
          Animated.delay(1800),
          Animated.sequence([
            Animated.delay(250),
            Animated.spring(sheet, {
              toValue: 1,
              friction: 8,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.delay(400),
        // 지도가 덮고 있을 때 보관함을 맨 위로, 지도가 사라진 뒤 지도를 처음 상태로 되돌린다.
        snap(scroll),
        Animated.timing(mapOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        snap(sheet),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mapOpacity, scroll, sheet]);

  const scale = width / CANVAS_WIDTH;

  return (
    <View
      accessible
      accessibilityLabel="공유한 장소가 보관함에 모이고, 지도에서 위치를 확인하는 화면"
      pointerEvents="none"
      style={[styles.viewport, { width, height }]}
    >
      <View
        style={[
          styles.canvas,
          {
            left: (width - CANVAS_WIDTH) / 2,
            top: (height - CANVAS_HEIGHT) / 2,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={styles.library}>
          <View style={styles.searchHeaderSpace} />
          <View style={styles.editActionRow}>
            <Text style={styles.editButtonText}>편집</Text>
          </View>
          <Animated.View
            style={{
              transform: [
                {
                  translateY: scroll.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -LIBRARY_SCROLL],
                  }),
                },
              ],
            }}
          >
            <SavedPlaceGrid places={ONBOARDING_PLACES} onPressPlace={noop} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.mapLayer, { opacity: mapOpacity }]}>
          <Image
            source={GUEST_MAP_IMAGE}
            resizeMode="cover"
            style={styles.map}
          />
          <Animated.View
            style={[
              styles.sheet,
              {
                transform: [
                  {
                    translateY: sheet.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SHEET_HEIGHT, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.pill} />
            {SHEET_PLACES.map(place => (
              <View key={place.id} style={styles.result}>
                <Image source={place.image} style={styles.photo} />
                <View style={styles.resultText}>
                  <View style={styles.titleRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {place.name}
                    </Text>
                    {getMiddleCategory(place.category) ? (
                      <View style={styles.categoryPill}>
                        <Text style={styles.category}>
                          {getMiddleCategory(place.category)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.address}>
                    {place.fullAddress || place.address}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>
        </Animated.View>
        <SearchBar layout="overlay" onPress={noop} />
      </View>
    </View>
  );
}

// 보관함·지도 시트 스타일은 SavedPlacesScreen, PlaceResultSheet와 같은 값을 쓴다.
const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#ffffff',
  },
  library: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: '#ffffff',
  },
  searchHeaderSpace: {
    height: SEARCH_BAR_HEIGHT + SEARCH_BAR_TOP_GAP * 2,
  },
  editActionRow: {
    alignItems: 'flex-end',
    marginHorizontal: 24,
    marginBottom: 2,
  },
  editButtonText: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    color: '#7b7d8b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  mapLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  map: {
    width: CANVAS_WIDTH,
    height: GUEST_MAP_HEIGHT,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    paddingTop: 14,
    paddingHorizontal: 13,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    marginBottom: 9,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  photo: {
    width: 100,
    height: 92,
    borderRadius: 4,
    resizeMode: 'cover',
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
});
