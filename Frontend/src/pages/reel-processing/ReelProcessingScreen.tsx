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
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {useScreenAnalytics} from '../../analytics/uiEvents';
import {subscribeRecentShares} from '../../entities/content/recent-shares-poller';
import {normalizeReelTitle} from '../../entities/content/title';
import type {HistoryReel} from '../../entities/content/types';

type ReelProcessingScreenProps = {
  reel: HistoryReel;
  onBack: () => void;
  /** 분석이 끝나 장소를 찾았을 때. 게시물 상세로 바꿔 보여 주면 됩니다. */
  onCompleted: (reel: HistoryReel) => void;
  /** 실패 안내의 "히스토리에서 확인하기"를 눌렀을 때. 히스토리(다시 시도)로 안내하면 됩니다. */
  onFailed: (reel: HistoryReel) => void;
};

const POLL_INTERVAL_MS = 3000;
const TICK_MS = 500;
const MAX_ESTIMATED_PROGRESS = 95;
const PROGRESS_TIME_CONSTANT_MS = 25_000;
const MIN_PROCESSING_PROGRESS = 3;
// 이전 버튼이 있는 위쪽 띠. 스와이프 뒤로가기 구역에서 빼서 이전 버튼이 눌리게 합니다.
const TOP_CLEARANCE = 130;

/** 처리 중·대기 중인 공유인지. 이런 공유는 게시물 상세 대신 이 화면으로 보여 줍니다. */
export function isReelInProgress(reel: HistoryReel) {
  return (
    reel.processing_status === 'PENDING' ||
    reel.processing_status === 'PROCESSING'
  );
}

/** 이 화면이 열려 있는 동안 왼쪽 가장자리 스와이프 뒤로가기 구역에서 뺄 위쪽 범위입니다. */
export function getProcessingBackGestureRegion() {
  return {top: TOP_CLEARANCE, bottom: 0};
}

/**
 * 서버가 진행률을 주지 않아서, 지나간 시간으로 어림한 진행률입니다. 시작은 빠르고 끝으로 갈수록
 * 느려지며 완료 전에는 95%를 넘지 않습니다.
 */
export function estimateProcessingProgress(elapsedMs: number) {
  const elapsed = Math.max(0, elapsedMs);
  const estimated = Math.round(
    MAX_ESTIMATED_PROGRESS * (1 - Math.exp(-elapsed / PROGRESS_TIME_CONSTANT_MS)),
  );
  return Math.min(
    MAX_ESTIMATED_PROGRESS,
    Math.max(MIN_PROCESSING_PROGRESS, estimated),
  );
}

function parseTime(value: string, fallback: number) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : fallback;
}

/** 처리 중인 릴스를 눌렀을 때 보여 주는 "릴스 살펴보는 중" 화면. 끝나면 알아서 다음 화면으로 넘어갑니다. */
export function ReelProcessingScreen({
  reel,
  onBack,
  onCompleted,
  onFailed,
}: ReelProcessingScreenProps) {
  const analytics = useScreenAnalytics('reel_processing');
  const [current, setCurrent] = useState(reel);
  const startedAtRef = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  const finishedRef = useRef(false);
  // 분석에 실패하면 히스토리로 몰래 보내지 않고, 이 화면 안에서 실패를 알립니다.
  const [failedReel, setFailedReel] = useState<HistoryReel | null>(null);
  const callbacksRef = useRef({onCompleted, onFailed});
  callbacksRef.current = {onCompleted, onFailed};

  // 같은 공유의 최신 상태를 앱 공용 폴러(3초)에서 받아, 끝나면 다음 화면으로 넘깁니다.
  useEffect(() => {
    const handleResult = (reels: HistoryReel[]) => {
      const latest = reels.find(item => item.id === reel.id);
      if (!latest || finishedRef.current) {
        return;
      }
      setCurrent(latest);
      if (latest.processing_status === 'COMPLETED') {
        finishedRef.current = true;
        callbacksRef.current.onCompleted(latest);
      } else if (latest.processing_status === 'FAILED') {
        finishedRef.current = true;
        setFailedReel(latest);
      }
    };
    const subscription = subscribeRecentShares({
      intervalMs: POLL_INTERVAL_MS,
      onResult: ({reels}) => handleResult(reels),
    });
    subscription.refresh().catch(() => undefined);
    return () => subscription.unsubscribe();
  }, [reel.id]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const isFailed = failedReel !== null;
  const isWaiting = !isFailed && current.processing_status === 'PENDING';
  const createdAt = parseTime(current.created_at, startedAtRef.current);
  // 시계가 어긋난 경우를 대비해, 이 화면을 연 시점보다 앞선 시간은 쓰지 않습니다.
  const elapsed = now - Math.max(createdAt, startedAtRef.current - 60_000);
  const percent = isWaiting ? 0 : estimateProcessingProgress(elapsed);

  const progress = useRef(new Animated.Value(percent)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: percent,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [percent, progress]);
  const barWidth = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const title = normalizeReelTitle(
    current.instagram_description,
    current.instagram_title,
  );
  const thumbnail = current.local_thumbnail_source
    ? current.local_thumbnail_source
    : current.instagram_thumbnail_url
      ? {uri: current.instagram_thumbnail_url}
      : null;

  const goBack = () => {
    analytics.button('back');
    onBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityLabel="이전 화면으로 돌아가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={goBack}
          style={styles.backButton}>
          <MaterialIcons color="#1a1a2e" name="chevron-left" size={30} />
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="보관함에서 기다리기"
        accessibilityRole="button"
        onPress={() => {
          analytics.button('wait_in_library');
          onBack();
        }}
        style={styles.tooltip}>
        <View style={styles.tooltipCaret} />
        <Text style={styles.tooltipText}>보관함에서 기다리기</Text>
      </Pressable>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.reelCard}>
          {thumbnail ? (
            <Image source={thumbnail} style={styles.reelThumbnail} />
          ) : (
            <LinearGradient
              colors={['#b9c2ff', '#e6e9ff']}
              end={{x: 1, y: 1}}
              start={{x: 0, y: 0}}
              style={styles.reelThumbnail}
            />
          )}
          <View style={styles.reelText}>
            <Text style={styles.reelLabel}>공유한 릴스</Text>
            <Text numberOfLines={1} style={styles.reelTitle}>
              {title}
            </Text>
          </View>
        </View>

        <View style={styles.illustrationRing}>
          <View style={styles.illustrationCircle}>
            <Image
              source={require('../../assets/illustrations/empty-illustration.png')}
              style={styles.illustration}
            />
          </View>
        </View>

        {isFailed ? (
          <View style={styles.failure}>
            <Text style={styles.statusText}>릴스에서 장소를 찾지 못했어요</Text>
            <Text style={styles.failureDescription}>
              히스토리에서 자세한 내용을 확인하고 다시 시도할 수 있어요.
              {__DEV__ && failedReel?.failure_reason
                ? `\n(${failedReel.failure_reason})`
                : ''}
            </Text>
            <Pressable
              accessibilityLabel="히스토리에서 확인하기"
              accessibilityRole="button"
              onPress={() => {
                analytics.button('open_history_after_failure');
                callbacksRef.current.onFailed(failedReel as HistoryReel);
              }}
              style={styles.failureButton}>
              <Text style={styles.failureButtonText}>히스토리에서 확인하기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.statusText}>
              {isWaiting ? '순서를 기다리는 중…' : '릴스 살펴보는 중… '}
              {isWaiting ? null : (
                <Text style={styles.percentText}>{percent}%</Text>
              )}
            </Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, {width: barWidth}]} />
            </View>

            <View style={styles.skeletonList}>
              {[0, 1].map(index => (
                <View key={index} style={styles.skeletonRow}>
                  <View style={styles.skeletonPhoto} />
                  <View style={styles.skeletonLines}>
                    <View style={styles.skeletonLineShort} />
                    <View style={styles.skeletonLineLong} />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topRow: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
  },
  tooltipCaret: {
    position: 'absolute',
    top: -6,
    left: 18,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1a1a2e',
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  reelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#f3f4fb',
  },
  reelThumbnail: {
    width: 40,
    height: 52,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  reelText: {
    flex: 1,
    gap: 3,
  },
  reelLabel: {
    color: '#8e8e93',
    fontSize: 12,
  },
  reelTitle: {
    color: '#1a1a2e',
    fontSize: 15,
    fontWeight: '800',
  },
  illustrationRing: {
    alignSelf: 'center',
    width: 240,
    height: 240,
    marginTop: 36,
    borderRadius: 120,
    borderWidth: 1.5,
    borderColor: '#cdd0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    backgroundColor: '#e4e6fc',
  },
  illustration: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  statusText: {
    marginTop: 22,
    textAlign: 'center',
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '800',
  },
  percentText: {
    color: '#4a53d0',
    fontSize: 20,
    fontWeight: '800',
  },
  progressTrack: {
    alignSelf: 'center',
    width: 221,
    height: 5,
    marginTop: 14,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#efeff5',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#5c63d8',
  },
  failure: {
    alignItems: 'center',
    gap: 10,
  },
  failureDescription: {
    textAlign: 'center',
    color: '#8e8e93',
    fontSize: 14,
    lineHeight: 21,
  },
  failureButton: {
    marginTop: 12,
    height: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#1a1a2e',
  },
  failureButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  skeletonList: {
    marginTop: 36,
    gap: 18,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  skeletonPhoto: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#eeeff5',
  },
  skeletonLines: {
    flex: 1,
    gap: 12,
  },
  skeletonLineShort: {
    width: 146,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#eeeff5',
  },
  skeletonLineLong: {
    width: 212,
    maxWidth: '100%',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#eeeff5',
  },
});
