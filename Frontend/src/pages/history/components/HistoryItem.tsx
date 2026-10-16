import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type {HistoryVisibleState} from '../../../analytics/placeExtractionEvents';
import {isReelInProgress} from '../../../entities/content/status';
import type {HistoryReel} from '../../../entities/content/types';
import {getHistoryTitle, getHistoryVisibleState, toHistoryThumbnailSource} from '../history-format';

/**
 * 히스토리 목록의 카드 한 장입니다. 처리 상태 배지와 제목을 보이고, 처리 중이면 배지를 깜빡입니다.
 * 처리 중인데 썸네일이나 제목이 아직 없으면 뼈대만 보이고 눌러도 반응하지 않습니다.
 */
export function HistoryItem({
  reel,
  onPress,
  onLayout,
}: {
  reel: HistoryReel;
  onPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const visibleState = getHistoryVisibleState(reel);
  const badge = HISTORY_BADGES[visibleState];
  const showSkeleton = visibleState === 'loading';
  const processing = isReelInProgress(reel.processing_status);
  const title = getHistoryTitle(reel);
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!processing) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [processing, pulse]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showSkeleton ? '새 히스토리를 불러오는 중' : undefined}
      onPress={showSkeleton ? undefined : onPress}
      onLayout={onLayout}
      style={styles.item}
    >
      {showSkeleton ? (
        <View style={[styles.thumbnail, styles.skeletonBlock]} />
      ) : (
        <Image
          source={toHistoryThumbnailSource(reel)}
          resizeMode="cover"
          style={styles.thumbnail}
        />
      )}
      <View style={styles.itemText}>
        {showSkeleton ? (
          <>
            <View style={[styles.skeletonBadge, styles.skeletonBlock]} />
            <View style={[styles.skeletonTitle, styles.skeletonBlock]} />
          </>
        ) : (
          <>
            <Animated.View
              key={processing ? 'processing-badge' : 'static-badge'}
              // eslint-disable-next-line react-native/no-inline-styles
              style={{opacity: processing ? pulse : 1}}
            >
            <View style={[styles.badge, badge.badgeStyle]}>
              <Text style={[styles.badgeText, badge.textStyle]}>{badge.label}</Text>
            </View>
            </Animated.View>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </>
        )}
      </View>
      {processing ? (
        <Text
          accessibilityElementsHidden
          style={[styles.chevron, styles.hiddenChevron]}
        >
          ›
        </Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    height: 94,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f3f3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  thumbnail: {
    width: 58,
    height: 73,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  skeletonBlock: { backgroundColor: '#eeeeF2' },
  skeletonBadge: { width: 34, height: 19, borderRadius: 10 },
  skeletonTitle: { width: '72%', height: 16, borderRadius: 5 },
  itemText: { height: 73, flex: 1, justifyContent: 'center', gap: 4 },
  badge: {
    height: 19,
    width: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '400' },
  failureBadge: { borderColor: '#fb6f6f' },
  successBadge: { borderColor: '#34c759' },
  failureText: { color: 'red' },
  successText: { color: '#34c759' },
  processingBadge: { borderColor: '#8e8e93' },
  processingText: { color: '#8e8e93' },
  title: { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  chevron: { fontSize: 32, lineHeight: 32, color: '#1c1c1e', marginRight: 5 },
  hiddenChevron: { opacity: 0 },
});

type HistoryBadge = {
  label: string;
  badgeStyle: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
};

/**
 * 카드 상태마다 배지의 문구와 테두리, 글자 스타일입니다. loading은 처리 중과 같은 배지를 쓰지만,
 * 썸네일이나 제목이 다 오기 전에는 배지 대신 뼈대를 보입니다.
 */
const HISTORY_BADGES: Record<HistoryVisibleState, HistoryBadge> = {
  loading: {label: '처리중', badgeStyle: styles.processingBadge, textStyle: styles.processingText},
  processing: {label: '처리중', badgeStyle: styles.processingBadge, textStyle: styles.processingText},
  success: {label: '성공', badgeStyle: styles.successBadge, textStyle: styles.successText},
  failed: {label: '실패', badgeStyle: styles.failureBadge, textStyle: styles.failureText},
};
