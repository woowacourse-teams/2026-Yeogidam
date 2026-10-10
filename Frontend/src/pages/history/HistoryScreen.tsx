import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  type LayoutChangeEvent,
} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {
  trackHistoryContentDetailViewed,
  trackHistoryContentViewed,
  trackHistoryViewed,
  type HistoryVisibleState,
} from '../../analytics/placeExtractionEvents';
import RetryIcon from '../../assets/icons/actions/retry.svg';
import ReportIcon from '../../assets/icons/actions/report.svg';
import InstagramIcon from '../../assets/icons/social/instagram-color.svg';
import {
  getHistoryReelPlaces,
  getHistoryReels,
  reportHistoryReel,
  retryHistoryExtraction,
} from '../../entities/content/api';
import type {
  ExtractionFailureReason,
  HistoryCursor,
  HistoryPlace,
  HistoryReel,
} from '../../entities/content/types';
import {normalizeReelTitle} from '../../entities/content/title';
import { ApiError } from '../../lib/api/errors';
import { parseServerDateTime } from '../../lib/api/values';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';

type HistoryScreenProps = { onBack: () => void };

const thumbnail =
  'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

const emptyCharacter =
  'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';
const placeThumbnail =
  'https://www.figma.com/api/mcp/asset/9313bcb8-b3f7-43b7-847e-e794cf94e2d9.png';
function getHistoryTitle(reel: HistoryReel) {
  return normalizeReelTitle(reel.caption, null);
}

function hasResolvedHistoryTitle(reel: HistoryReel) {
  return getHistoryTitle(reel) !== '저장한 콘텐츠';
}

export function getHistoryFailureMessage(
  reason: ExtractionFailureReason | null,
) {
  switch (reason) {
    case 'CONTENT_UNAVAILABLE':
      return '릴스 내용을 읽지 못했어요.';
    case 'PLACE_NOT_EXTRACTED':
      return '캡션에서 장소를 찾지 못했어요.';
    case 'PLACE_NOT_MATCHED':
      return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PROCESSING_FAILED':
      return '서버에서 분석을 처리하지 못했어요.';
    case 'UNEXPECTED':
    default:
      return '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

function HistoryItem({
  reel,
  skeleton = false,
  onPress,
  onLayout,
}: {
  reel: HistoryReel;
  skeleton?: boolean;
  onPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const completed = reel.extractionStatus === 'SUCCEEDED';
  const processing = reel.extractionStatus === 'EXTRACTING';
  const title = getHistoryTitle(reel);
  const metadataPending =
    processing && (!reel.thumbnailUrl || !hasResolvedHistoryTitle(reel));
  const showSkeleton = skeleton || metadataPending;
  const label = completed ? '성공' : processing ? '처리중' : '실패';
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (!processing || skeleton) {
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
  }, [processing, pulse, skeleton]);
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
          source={{ uri: reel.thumbnailUrl ?? thumbnail }}
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
      {!showSkeleton && !processing ? (
        <Text style={styles.chevron}>›</Text>
      ) : processing ? (
        <Text
          accessibilityElementsHidden
          style={[styles.chevron, styles.hiddenChevron]}
        >
          ›
        </Text>
      ) : null}
    </Pressable>
  );
}

function formatHistoryDate(createdAt: string) {
  const date = parseServerDateTime(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function useHistoryReelPlaces(sharedMediaId: string) {
  const [places, setPlaces] = useState<HistoryPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getHistoryReelPlaces(sharedMediaId)
      .then(setPlaces)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [sharedMediaId]);

  return { places, loading, error };
}

function HistorySuccessDetail({
  onBack,
  reel,
}: {
  onBack: () => void;
  reel: HistoryReel;
}) {
  const posthog = usePostHog();
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.sharedMediaId, 'success');
  }, [posthog, reel.sharedMediaId]);
  const { places, loading, error } = useHistoryReelPlaces(reel.sharedMediaId);
  const originalUrl = reel.sharedUrl;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대기함으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHero}>
          <Image
            source={{ uri: reel.thumbnailUrl ?? thumbnail }}
            resizeMode="cover"
            style={styles.detailThumbnail}
          />
          <Text style={styles.detailTitle}>장소 분석이 완료되었어요!</Text>
          <Text style={styles.detailSubtitle}>
            {loading
              ? '장소를 확인하고 있어요.'
              : `총 ${places.length}개의 장소를 찾았어요`}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              Linking.openURL(originalUrl).catch(() => undefined);
            }
          }}
          style={[styles.originalButton, !originalUrl && styles.disabledButton]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Text style={styles.foundTitle}>발견한 장소</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.placeRow}
        >
          {loading ? (
            <Text style={styles.placeState}>장소를 불러오는 중이에요.</Text>
          ) : error ? (
            <Text style={styles.placeState}>장소를 불러오지 못했어요.</Text>
          ) : places.length === 0 ? (
            <Text style={styles.placeState}>발견한 장소가 없어요.</Text>
          ) : (
            places.map(place => (
              <View key={place.placeId} style={styles.placeCard}>
                <Image
                  source={{ uri: place.thumbnailUrl ?? placeThumbnail }}
                  style={styles.placeImage}
                />
                <Text numberOfLines={1} style={styles.placeName}>
                  {place.name}
                </Text>
                <Text numberOfLines={1} style={styles.placeAddress}>
                  {place.roadAddress ?? place.landLotAddress}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

function HistoryFailureDetail({
  onBack,
  reel,
  onRetry,
}: {
  onBack: () => void;
  reel: HistoryReel;
  onRetry: () => Promise<void>;
}) {
  const posthog = usePostHog();
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.sharedMediaId, 'failed');
  }, [posthog, reel.sharedMediaId]);
  const [reported, setReported] = useState(false);
  const originalUrl = reel.sharedUrl;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="히스토리 목록으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.failureContent}>
        <View style={styles.failureHero}>
          <Image
            source={{ uri: reel.thumbnailUrl ?? thumbnail }}
            resizeMode="cover"
            style={styles.detailThumbnail}
          />
          <Text style={styles.detailTitle}>장소 분석에 실패했어요ㅠ</Text>
          <Text style={styles.failureDescription}>
            {getHistoryFailureMessage(reel.failureReason)}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              Linking.openURL(originalUrl).catch(() => undefined);
            }
          }}
          style={[styles.originalButton, !originalUrl && styles.disabledButton]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            Alert.alert('다시 시도할까요?', '', [
              { text: '취소', style: 'cancel' },
              {
                text: '확인',
                onPress: () => {
                  onRetry().catch(() => undefined);
                },
              },
            ]);
          }}
          style={styles.actionButton}
        >
          <RetryIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>다시 시도하기</Text>
        </Pressable>
        <Pressable
          disabled={reported}
          onPress={() =>
            Alert.alert('제보할까요?', '', [
              { text: '취소', style: 'cancel' },
              {
                text: '확인',
                onPress: () => {
                  setReported(true);
                  reportHistoryReel(reel.sharedMediaId)
                    .catch(reportError => {
                      if (
                        reportError instanceof ApiError &&
                        reportError.errorCode === 'MEDIA409_001'
                      ) {
                        Alert.alert('이미 제보한 이력이에요');
                        return;
                      }
                      setReported(false);
                      Alert.alert('제보하지 못했어요', '잠시 후 다시 시도해주세요.');
                    });
                },
              },
            ])
          }
          style={[
            styles.actionButton,
            styles.reportActionButton,
            reported && styles.disabledButton,
          ]}
        >
          <ReportIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>
            {reported ? '제보 완료' : '제보하기'}
          </Text>
        </Pressable>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const posthog = usePostHog();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const groupOffsetsRef = useRef(new Map<string, number>());
  const cardLayoutsRef = useRef(new Map<string, {group: string; y: number; height: number}>());
  const seenCardsRef = useRef(new Set<string>());
  const visibleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const cardStatesRef = useRef(new Map<string, HistoryVisibleState>());
  const historyViewedRef = useRef(false);
  const shouldRestoreScrollRef = useRef(false);
  const [reels, setReels] = useState<HistoryReel[]>([]);
  const [cursor, setCursor] = useState<HistoryCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selectedSuccess, setSelectedSuccess] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(false);
  const [selectedReel, setSelectedReel] = useState<HistoryReel | null>(null);
  const [retrySkeletonIds, setRetrySkeletonIds] = useState<Set<string>>(
    () => new Set(),
  );

  cardStatesRef.current = new Map(reels.filter(reel => !reel.sharedMediaId.startsWith('retry-')).map(reel => {
    const processing = reel.extractionStatus === 'EXTRACTING';
    const state: HistoryVisibleState = retrySkeletonIds.has(reel.sharedMediaId) ||
      (processing && (!reel.thumbnailUrl || !hasResolvedHistoryTitle(reel)))
      ? 'loading' : reel.extractionStatus === 'SUCCEEDED' ? 'success'
      : reel.extractionStatus === 'FAILED' ? 'failed' : 'processing';
    return [reel.sharedMediaId, state];
  }));

  const evaluateVisibleCards = useCallback(() => {
    if (selectedSuccess || selectedFailure) return;
    const top = scrollOffsetRef.current;
    const bottom = top + viewportHeightRef.current;
    for (const [contentId, layout] of cardLayoutsRef.current) {
      const state = cardStatesRef.current.get(contentId);
      const groupY = groupOffsetsRef.current.get(layout.group);
      if (!state || groupY === undefined || viewportHeightRef.current === 0) continue;
      const cardTop = groupY + layout.y;
      const overlap = Math.max(0, Math.min(cardTop + layout.height, bottom) - Math.max(cardTop, top));
      const key = `${contentId}.${state}`;
      if (overlap >= layout.height / 2 && !seenCardsRef.current.has(key)) {
        if (!visibleTimersRef.current.has(key)) {
          const timer = setTimeout(() => {
            visibleTimersRef.current.delete(key);
            const latest = cardLayoutsRef.current.get(contentId);
            const latestY = latest && groupOffsetsRef.current.get(latest.group);
            if (!latest || latestY === undefined || cardStatesRef.current.get(contentId) !== state) return;
            const visible = Math.max(0, Math.min(latestY + latest.y + latest.height,
              scrollOffsetRef.current + viewportHeightRef.current) - Math.max(latestY + latest.y, scrollOffsetRef.current));
            if (visible >= latest.height / 2 && !seenCardsRef.current.has(key)) {
              seenCardsRef.current.add(key);
              trackHistoryContentViewed(posthog, contentId, state);
            }
          }, 500);
          visibleTimersRef.current.set(key, timer);
        }
      } else {
        const timer = visibleTimersRef.current.get(key);
        if (timer) clearTimeout(timer);
        visibleTimersRef.current.delete(key);
      }
    }
  }, [posthog, selectedSuccess, selectedFailure]);

  useEffect(() => {
    evaluateVisibleCards();
  }, [evaluateVisibleCards, reels, retrySkeletonIds]);

  useEffect(() => () => {
    visibleTimersRef.current.forEach(clearTimeout);
    visibleTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (selectedSuccess || selectedFailure) {
      visibleTimersRef.current.forEach(clearTimeout);
      visibleTimersRef.current.clear();
    }
  }, [selectedSuccess, selectedFailure]);

  const load = useCallback(async (nextCursor?: HistoryCursor | null, silent = false) => {
    setError(false);
    if (nextCursor) setLoadingMore(true);
    else if (!silent) setLoading(true);
    try {
      const result = await getHistoryReels(nextCursor ?? undefined);
      // This screen is visible while refreshing, so the newest status is
      // already seen by the user and must not create a badge on exit.
      if (!nextCursor && result.reels[0]) {
        await setLastSeenHistorySnapshot({
          id: result.reels[0].sharedMediaId,
          status: result.reels[0].extractionStatus,
        });
      }
      setRetrySkeletonIds(current => {
        const next = new Set(current);
        result.reels.forEach(reel => {
          if (next.has(reel.sharedMediaId) && hasResolvedHistoryTitle(reel)) {
            next.delete(reel.sharedMediaId);
          }
        });
        return next;
      });
      setReels(current => {
        const temporaryReels = current.filter(item => item.sharedMediaId.startsWith('retry-'));
        const temporaryUrls = new Set(
          temporaryReels
            .map(item => item.sharedUrl)
            .filter((url): url is string => Boolean(url)),
        );
        const knownReelIds = new Set(
          current
            .filter(item => !item.sharedMediaId.startsWith('retry-'))
            .map(item => item.sharedMediaId),
        );
        const refreshedReels = nextCursor
          ? [...current, ...result.reels]
          : result.reels;

        return [
          ...temporaryReels,
          ...refreshedReels.filter(
            item =>
              !temporaryReels.some(temporary => temporary.sharedMediaId === item.sharedMediaId) &&
              (!temporaryUrls.has(item.sharedUrl) ||
                knownReelIds.has(item.sharedMediaId)),
          ),
        ];
      });
      setCursor(result.nextCursor);
      if (!nextCursor && !silent && !historyViewedRef.current) {
        historyViewedRef.current = true;
        requestAnimationFrame(() => trackHistoryViewed(posthog, result.reels.length ? 'list' : 'empty'));
      }
    } catch {
      setError(true);
      if (!nextCursor && !silent && !historyViewedRef.current) {
        historyViewedRef.current = true;
        requestAnimationFrame(() => trackHistoryViewed(posthog, 'error'));
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [posthog]);

  const retryHistoryReel = useCallback(async (reel: HistoryReel) => {
    const temporaryId = `retry-${reel.sharedMediaId}-${Date.now()}`;
    const temporaryReel: HistoryReel = {
      ...reel,
      sharedMediaId: temporaryId,
      extractionStatus: 'EXTRACTING',
      failureReason: null,
      createdAt: new Date().toISOString(),
    };

    // A retry adds a new item at the top, so the list should start at the top
    // instead of restoring the position of the failed item's detail view.
    scrollOffsetRef.current = 0;
    shouldRestoreScrollRef.current = false;

    // Show the new attempt immediately while the retry request is in flight.
    setReels(current => [temporaryReel, ...current]);
    setRetrySkeletonIds(current => new Set(current).add(temporaryId));
    setSelectedFailure(false);
    setSelectedReel(null);

    try {
      const result = await retryHistoryExtraction(reel.sharedMediaId);
      // The newly created retry is already visible in this screen, so it
      // should not appear as an unread history when returning to the inbox.
      await setLastSeenHistorySnapshot({
        id: result.sharedMediaId,
        status: result.extractionStatus,
      });
      setRetrySkeletonIds(current => {
        const next = new Set(current);
        next.delete(temporaryId);
        return next;
      });
      // Retry returns a new history record, or the record that is already
      // extracting the same post. Keep the original failed record and show the
      // returned record at the top with the failed record's post information.
      setReels(current => [
        {
          ...temporaryReel,
          sharedMediaId: result.sharedMediaId,
          extractionStatus: result.extractionStatus,
        },
        ...current.filter(
          item =>
            item.sharedMediaId !== temporaryId &&
            item.sharedMediaId !== result.sharedMediaId,
        ),
      ]);
    } catch (retryError) {
      setReels(current => current.filter(item => item.sharedMediaId !== temporaryId));
      setRetrySkeletonIds(current => {
        const next = new Set(current);
        next.delete(temporaryId);
        return next;
      });
      // A 400 carries the server's reason why this history cannot be retried.
      Alert.alert(
        '다시 시도하지 못했어요',
        retryError instanceof ApiError && retryError.status === 400
          ? retryError.message
          : '잠시 후 다시 시도해주세요.',
      );
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const refresh = setInterval(() => {
      load(undefined, true).catch(() => undefined);
    }, 5000);

    return () => clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    if (
      selectedSuccess ||
      selectedFailure ||
      loading ||
      !shouldRestoreScrollRef.current ||
      scrollOffsetRef.current <= 0
    ) {
      return;
    }

    const restoreScroll = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: scrollOffsetRef.current,
        animated: false,
      });
      shouldRestoreScrollRef.current = false;
    });

    return () => cancelAnimationFrame(restoreScroll);
  }, [loading, reels.length, selectedFailure, selectedSuccess]);

  const groupedReels = reels.reduce<Record<string, HistoryReel[]>>(
    (groups, reel) => {
      const date = formatHistoryDate(reel.createdAt);
      groups[date] = groups[date] ? [...groups[date], reel] : [reel];
      return groups;
    },
    {},
  );

  if (selectedSuccess) {
    return (
      <HistorySuccessDetail
        onBack={() => {
          shouldRestoreScrollRef.current = true;
          setSelectedSuccess(false);
          setSelectedReel(null);
        }}
        reel={selectedReel as HistoryReel}
      />
    );
  }
  if (selectedFailure) {
    return (
      <HistoryFailureDetail
        onBack={() => {
          shouldRestoreScrollRef.current = true;
          setSelectedFailure(false);
          setSelectedReel(null);
        }}
        reel={selectedReel as HistoryReel}
        onRetry={() => retryHistoryReel(selectedReel as HistoryReel)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        ref={scrollViewRef}
        onLayout={event => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
          evaluateVisibleCards();
        }}
        contentContainerStyle={[
          styles.content,
          !loading && reels.length === 0 && styles.emptyContent,
        ]}
        onScroll={({nativeEvent}) => {
          scrollOffsetRef.current = nativeEvent.contentOffset.y;
          evaluateVisibleCards();
          const reachedBottom =
            nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - 80;
          if (reachedBottom && cursor && !loadingMore) {
            load(cursor).catch(() => undefined);
          }
        }}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.stateText}>히스토리를 불러오는 중이에요.</Text>
        ) : error ? (
          <View style={styles.stateBody}>
            <Text style={styles.stateText}>히스토리를 불러오지 못했어요.</Text>
            <Pressable onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : reels.length === 0 ? (
          <View style={styles.emptyBody}>
            <Image
              source={{ uri: emptyCharacter }}
              style={styles.emptyCharacter}
            />
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>아직 공유된 콘텐츠가 없어요</Text>
              <Text style={styles.emptyDescription}>
                인스타그램 릴스나 유튜브 쇼츠에서{'\n'}공유하기를 통해 여기담에
                저장해보세요.
              </Text>
            </View>
          </View>
        ) : (
          Object.entries(groupedReels).map(([date, dateReels]) => (
            <View key={date} style={styles.group} onLayout={event => {
              groupOffsetsRef.current.set(date, event.nativeEvent.layout.y);
              evaluateVisibleCards();
            }}>
              <Text style={styles.date}>{date}</Text>
              {dateReels.map(reel => (
                <HistoryItem
                  key={reel.sharedMediaId}
                  reel={reel}
                  skeleton={retrySkeletonIds.has(reel.sharedMediaId)}
                  onLayout={event => {
                    cardLayoutsRef.current.set(reel.sharedMediaId, {
                      group: date,
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    });
                    evaluateVisibleCards();
                  }}
                  onPress={
                    reel.extractionStatus === 'SUCCEEDED'
                      ? () => {
                          setSelectedReel(reel);
                          setSelectedSuccess(true);
                        }
                      : reel.extractionStatus === 'FAILED'
                      ? () => {
                          setSelectedReel(reel);
                          setSelectedFailure(true);
                        }
                      : undefined
                  }
                />
              ))}
            </View>
          ))
        )}
        {loadingMore ? <Text style={styles.moreLoadingText}>이전 기록을 불러오는 중이에요.</Text> : null}
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 84,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    fontSize: 30,
    lineHeight: 34,
    color: 'rgba(0,0,0,.61)',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginLeft: 17,
  },
  headerSpacer: { flex: 1 },
  previewToggle: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#f3f4fb',
  },
  previewToggleText: { fontSize: 12, fontWeight: '700', color: '#5c6fc8' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  emptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 72,
    paddingHorizontal: 24,
  },
  emptyBody: { alignItems: 'center' },
  emptyCharacter: {
    width: 195,
    height: 195,
    borderRadius: 30,
    marginBottom: 24,
  },
  emptyText: { alignItems: 'center' },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 22.4,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 8,
  },
  detailContent: { paddingBottom: 60 },
  detailHero: { alignItems: 'center', marginTop: 48 },
  detailThumbnail: {
    width: 180,
    height: 226,
    borderRadius: 12,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 24,
  },
  detailSubtitle: { fontSize: 14, color: '#8e8e93', marginTop: 8 },
  originalButton: {
    height: 61,
    marginHorizontal: 22,
    marginTop: 49,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.14)',
    borderRadius: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 50,
  },
  disabledButton: { opacity: 0.45 },
  instagramIcon: { width: 28, height: 27 },
  originalText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  detailChevron: { fontSize: 30, color: '#000' },
  foundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 35,
    marginLeft: 32,
  },
  placeRow: { paddingLeft: 31, paddingTop: 12, gap: 6 },
  placeCard: { width: 98 },
  placeImage: { width: 98, height: 98, borderRadius: 2 },
  placeName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 2,
  },
  placeAddress: { fontSize: 9, color: '#8e8e93', marginTop: 3 },
  placeState: { fontSize: 13, color: '#8e8e93', paddingTop: 24 },
  failureContent: { paddingBottom: 60 },
  failureHero: { alignItems: 'center', marginTop: 44 },
  failureDescription: {
    fontSize: 14,
    lineHeight: 22.4,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 6,
  },
  actionButton: {
    height: 40,
    marginHorizontal: 22,
    marginTop: 70,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.16)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportActionButton: { marginTop: 13 },
  actionIcon: { position: 'absolute', left: 32 },
  actionText: { fontSize: 15, fontWeight: '600', color: '#000' },
  group: { marginBottom: 16 },
  stateBody: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 180,
  },
  stateText: { fontSize: 15, color: '#8e8e93', textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#dbe0f9',
  },
  retryText: { fontSize: 14, fontWeight: '700', color: '#2a2a44' },
  moreButton: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#f3f4fb',
  },
  moreLoadingText: {
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 13,
    color: '#8e8e93',
  },
  date: { fontSize: 16, fontWeight: '600', color: '#727070', marginBottom: 8 },
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
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 139,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    opacity: 0.2,
  },
});
