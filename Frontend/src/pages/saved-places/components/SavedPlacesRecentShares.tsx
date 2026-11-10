import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {Circle} from 'react-native-svg';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {getHistoryReelPlaceCount} from '../../../entities/content/history-api';
import type {HistoryReel} from '../../../entities/content/types';
import {
  getPlaceholderGradient,
  LIBRARY_COLORS,
  LIBRARY_GUTTER,
} from './libraryTheme';

type SavedPlacesRecentSharesProps = {
  reels: HistoryReel[];
  onPressAdd: () => void;
  /** 오른쪽 위 "전체보기"를 눌렀을 때 히스토리 화면으로 이동합니다. */
  onPressViewAll: () => void;
  onPressReel?: (reel: HistoryReel) => void;
};

// 가장 최근에 추가한 릴스 4개와 링크 추가 버튼만 보여 줍니다(공유 목록은 최신순).
const MAX_RECENT_REELS = 4;
const RING_SIZE = 56;
const RING_WIDTH = 2;
const RING_GAP = 3;
const THUMBNAIL_SIZE = RING_SIZE - RING_WIDTH * 2 - RING_GAP * 2;
const ITEM_WIDTH = 64;

const RING_COLORS = {
  track: '#dcdff0',
  progress: '#8e9cf6',
  pendingFill: '#e3e5f2',
  done: '#6fa882',
  failed: '#d6d6d6',
  add: '#c9c6dc',
  addIcon: '#4a4fc9',
  labelProcessing: '#4a53d0',
  labelDone: '#4f8a63',
} as const;

type StoryStatus = 'processing' | 'pending' | 'done' | 'failed';

function toStoryStatus(status: HistoryReel['processing_status']): StoryStatus {
  switch (status) {
    case 'COMPLETED':
      return 'done';
    case 'FAILED':
      return 'failed';
    case 'PROCESSING':
      return 'processing';
    default:
      return 'pending';
  }
}

/**
 * 공유 목록 응답에는 장소 수가 없어서, 완료된 공유마다 한 번만 장소 수를 읽어 캐시합니다.
 * 실패하면 다시 시도하지 않고 마커 없이 보여 줍니다(폴링마다 재요청하지 않기 위해).
 */
function useExtractedPlaceCounts(reels: HistoryReel[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const requestedIds = useRef(new Set<string>());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    reels
      .filter(
        reel =>
          reel.processing_status === 'COMPLETED' &&
          !requestedIds.current.has(reel.id),
      )
      .forEach(reel => {
        requestedIds.current.add(reel.id);
        (async () => {
          try {
            const count = await getHistoryReelPlaceCount(reel.id);
            if (isMountedRef.current) {
              setCounts(current => ({...current, [reel.id]: count}));
            }
          } catch {
            // 개수를 못 읽어도 "완료"로 충분히 알 수 있습니다.
          }
        })();
      });
  }, [reels]);

  return counts;
}

function getStoryLabel(status: StoryStatus) {
  switch (status) {
    case 'processing':
      return '장소 찾는 중';
    case 'pending':
      return '대기 중';
    case 'done':
      return '완료';
    default:
      return '실패';
  }
}

function StoryThumbnail({reel, index}: {reel: HistoryReel; index: number}) {
  const source = reel.local_thumbnail_source
    ? reel.local_thumbnail_source
    : reel.instagram_thumbnail_url
      ? {uri: reel.instagram_thumbnail_url}
      : null;

  return source ? (
    <Image source={source} style={styles.thumbnail} />
  ) : (
    <LinearGradient
      colors={getPlaceholderGradient(index)}
      end={{x: 1, y: 1}}
      start={{x: 0, y: 0}}
      style={styles.thumbnail}
    />
  );
}

const PROGRESS_RADIUS = (RING_SIZE - RING_WIDTH) / 2;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;

/** 분석 중인 공유의 링: 연한 바탕 링 위로 호가 한 바퀴씩 돕니다. */
function ProgressRing() {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        isInteraction: false,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const center = RING_SIZE / 2;

  return (
    <View pointerEvents="none" style={styles.progressWrap}>
      <Svg height={RING_SIZE} width={RING_SIZE}>
        <Circle
          cx={center}
          cy={center}
          fill="none"
          r={PROGRESS_RADIUS}
          stroke={RING_COLORS.track}
          strokeWidth={RING_WIDTH}
        />
      </Svg>
      <Animated.View style={[styles.progressArc, {transform: [{rotate}]}]}>
        <Svg height={RING_SIZE} width={RING_SIZE}>
          <Circle
            cx={center}
            cy={center}
            fill="none"
            originX={center}
            originY={center}
            r={PROGRESS_RADIUS}
            rotation={-90}
            stroke={RING_COLORS.progress}
            strokeDasharray={`${PROGRESS_CIRCUMFERENCE * 0.28} ${PROGRESS_CIRCUMFERENCE}`}
            strokeLinecap="round"
            strokeWidth={RING_WIDTH}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function StoryRing({
  status,
  reel,
  index,
  extractedCount,
}: {
  status: StoryStatus;
  reel: HistoryReel;
  index: number;
  extractedCount?: number;
}) {
  if (status === 'pending') {
    return (
      <View style={[styles.ring, styles.pendingRing]}>
        <View style={styles.pendingFill} />
      </View>
    );
  }

  if (status === 'processing') {
    return (
      <View style={styles.ringBox}>
        <ProgressRing />
        <View style={styles.thumbnailHolder}>
          <StoryThumbnail index={index} reel={reel} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.ring,
        {borderColor: status === 'done' ? RING_COLORS.done : RING_COLORS.failed},
      ]}>
      <View style={styles.thumbnailHolder}>
        <StoryThumbnail index={index} reel={reel} />
      </View>
      {status === 'done' && extractedCount !== undefined ? (
        <View style={styles.countMarker}>
          <Text style={styles.countMarkerText}>{extractedCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SavedPlacesRecentShares({
  reels,
  onPressAdd,
  onPressViewAll,
  onPressReel,
}: SavedPlacesRecentSharesProps) {
  const visibleReels = reels.slice(0, MAX_RECENT_REELS);
  const counts = useExtractedPlaceCounts(visibleReels);

  if (reels.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {/*
          스크린 리더에서 머리말 단위로 건너뛰어 바로 올 수 있게 머리말로 표시하고,
          가로 목록 끝의 '링크 추가'까지 가지 않아도 위아래로 쓸어 바로 실행할 수 있게 동작을 붙입니다.
          iOS에서 Text에 붙인 동작은 VoiceOver에 전달되지 않아 View로 감쌉니다.
        */}
        <View
          accessible
          accessibilityActions={[
            {name: 'addLink', label: '링크 추가'},
            {name: 'viewAll', label: '전체보기'},
          ]}
          accessibilityLabel="최근 공유"
          accessibilityRole="header"
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'addLink') onPressAdd();
            if (event.nativeEvent.actionName === 'viewAll') onPressViewAll();
          }}>
          <Text style={styles.title}>최근 공유</Text>
        </View>
        <Pressable
          accessibilityLabel="최근 공유 전체보기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onPressViewAll}
          style={({pressed}) => [styles.viewAll, pressed && styles.pressed]}>
          <Text style={styles.viewAllText}>전체보기</Text>
          <MaterialIcons
            color={LIBRARY_COLORS.muted}
            name="chevron-right"
            size={20}
          />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.row}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {visibleReels.map((reel, index) => {
          const status = toStoryStatus(reel.processing_status);
          const extractedCount = counts[reel.id];
          const label = getStoryLabel(status);

          return (
            <Pressable
              key={reel.id}
              accessibilityLabel={
                extractedCount === undefined || status !== 'done'
                  ? `최근 공유 ${label}`
                  : `최근 공유 ${label}, ${extractedCount}곳 추출`
              }
              accessibilityRole="button"
              onPress={() => onPressReel?.(reel)}
              style={({pressed}) => [styles.item, pressed && styles.pressed]}>
              <StoryRing
                index={index}
                reel={reel}
                extractedCount={extractedCount}
                status={status}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  status === 'processing' && styles.labelProcessing,
                  status === 'done' && styles.labelDone,
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityLabel="링크 추가"
          accessibilityRole="button"
          onPress={onPressAdd}
          style={({pressed}) => [styles.item, pressed && styles.pressed]}>
          <View style={[styles.ring, styles.addRing]}>
            <MaterialIcons color={RING_COLORS.addIcon} name="add" size={26} />
          </View>
          <Text numberOfLines={1} style={styles.label}>
            링크 추가
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIBRARY_GUTTER,
  },
  title: {
    color: LIBRARY_COLORS.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    color: LIBRARY_COLORS.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
    gap: 6,
    paddingHorizontal: LIBRARY_GUTTER,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    gap: 8,
  },
  ringBox: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailHolder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: THUMBNAIL_SIZE / 2,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  progressWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
  },
  progressArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
  },
  pendingRing: {
    borderStyle: 'dashed',
    borderColor: RING_COLORS.track,
  },
  pendingFill: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: THUMBNAIL_SIZE / 2,
    backgroundColor: RING_COLORS.pendingFill,
  },
  addRing: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: RING_COLORS.add,
    backgroundColor: '#ffffff',
  },
  // 완료된 공유에서 저장된 장소 수를 보여 주는 숫자 마커입니다.
  countMarker: {
    position: 'absolute',
    right: -8,
    bottom: -4,
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: RING_COLORS.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countMarkerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  label: {
    color: LIBRARY_COLORS.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  labelProcessing: {
    color: RING_COLORS.labelProcessing,
    fontWeight: '800',
  },
  labelDone: {
    color: RING_COLORS.labelDone,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
