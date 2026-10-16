import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import type {HistoryReel} from '../../../entities/content/types';
import {getHistoryTitle, hasResolvedHistoryTitle} from '../history-format';
import {HISTORY_FALLBACK_THUMBNAIL} from './historyStyles';

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
  const completed = reel.processing_status === 'COMPLETED';
  const processing =
    reel.processing_status === 'PENDING' ||
    reel.processing_status === 'PROCESSING';
  const title = getHistoryTitle(reel);
  const metadataPending =
    processing &&
    (!reel.instagram_thumbnail_url || !hasResolvedHistoryTitle(reel));
  const showSkeleton = metadataPending;
  const label = completed ? '성공' : processing ? '처리중' : '실패';
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
          source={reel.local_thumbnail_source ?? { uri: reel.instagram_thumbnail_url ?? HISTORY_FALLBACK_THUMBNAIL }}
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
            <View
              style={[
                styles.badge,
                completed
                  ? styles.successBadge
                  : processing
                  ? styles.processingBadge
                  : styles.failureBadge,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  completed
                    ? styles.successText
                    : processing
                    ? styles.processingText
                    : styles.failureText,
                ]}
              >
                {label}
              </Text>
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
