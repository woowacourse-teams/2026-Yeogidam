import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
  type LayoutChangeEvent,
} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {v4 as uuidv4} from 'uuid';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  getBottomNavigationBarOffset,
} from '../../components/BottomNavigationBar';
import {
  toExtractionFailureType,
  trackExtractionRequestFinished,
  trackExtractionRequestStarted,
  trackHistoryContentDetailViewed,
  trackHistoryContentViewed,
  trackHistoryViewed,
  type HistoryVisibleState,
} from '../../analytics/placeExtractionEvents';
import RetryIcon from '../../assets/icons/actions/retry.svg';
import ReportIcon from '../../assets/icons/actions/report.svg';
import InstagramIcon from '../../assets/icons/social/instagram-color.svg';
import {
  getHistoryReelDetail,
  getHistoryReels,
  reportHistoryReel,
  retryHistoryReelExtraction,
} from '../../entities/content/history-api';
import {normalizeReelError} from '../../entities/content/errors';
import {
  subscribeRecentShares,
  type RecentSharesSnapshot,
  type RecentSharesSubscription,
} from '../../entities/content/recent-shares-poller';
import type {
  HistoryCursor,
  HistoryPlace,
  HistoryReel,
  HistoryReelDetail,
} from '../../entities/content/types';
import {normalizeReelTitle} from '../../entities/content/title';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';

type HistoryScreenProps = {
  onBack: () => void;
  guestReels?: HistoryReel[];
  guestDetails?: Record<string, HistoryReelDetail>;
  onRequireLogin?: () => void;
};

const thumbnail =
  'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

const emptyCharacter =
  'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';
const placeThumbnail =
  'https://www.figma.com/api/mcp/asset/9313bcb8-b3f7-43b7-847e-e794cf94e2d9.png';
function getHistoryTitle(reel: HistoryReel) {
  return normalizeReelTitle(reel.instagram_description, reel.instagram_title);
}

function hasResolvedHistoryTitle(reel: HistoryReel) {
  return getHistoryTitle(reel) !== '저장한 콘텐츠';
}

function getFailureCode(reason: string | null) {
  return reason?.split(' | ', 1)[0]?.trim() || null;
}

function getHistoryFailureMessage(reason: string | null) {
  switch (getFailureCode(reason)) {
    case 'CLIENT000_001':
      return '인터넷 연결이 불안정해요.';
    case 'CLIENT000_002':
      return '응답이 늦어져 분석하지 못했어요.';
    case 'AUTH401_001':
      return '로그인이 필요해요.';
    case 'AUTH401_002':
      return '로그인이 만료됐어요.';
    case 'AUTH403_001':
      return '분석할 권한이 없어요.';
    case 'IG_CAPTION_NOT_FOUND':
      return '릴스 내용을 읽지 못했어요.';
    case 'GEMINI_PLACE_NOT_FOUND':
      return '캡션에서 장소를 찾지 못했어요.';
    case 'KAKAO_PLACE_NOT_FOUND':
      return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PLACE_NOT_FOUND':
      return '장소를 찾지 못했어요.';
    // Spring 서버 ExtractionFailureReason
    case 'CONTENT_UNAVAILABLE':
      return '원본 릴스를 불러오지 못했어요.';
    case 'PLACE_NOT_EXTRACTED':
      return '릴스에서 장소 정보를 찾지 못했어요.';
    case 'PLACE_NOT_MATCHED':
      return '지도에서 장소를 찾지 못했어요.';
    case 'PROCESSING_FAILED':
      return '장소 정보를 처리하지 못했어요.';
    case 'UNEXPECTED':
      return '알 수 없는 문제가 발생했어요.';
    case 'DATA500_001':
    case 'COMMON500_001':
      return '서버에서 분석을 처리하지 못했어요.';
    default:
      return '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

function HistoryItem({
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
          source={reel.local_thumbnail_source ?? { uri: reel.instagram_thumbnail_url ?? thumbnail }}
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
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function useHistoryReelDetail(
  reel: HistoryReel,
  guestDetail?: HistoryReelDetail | null,
) {
  const [detail, setDetail] = useState<HistoryReelDetail | null>(guestDetail ?? null);
  const [loading, setLoading] = useState(guestDetail === undefined);
  const [error, setError] = useState(false);
  // 폴링이 같은 항목을 새 객체로 바꿔도 다시 조회하지 않도록 ID가 바뀔 때만 읽는다.
  const reelRef = useRef(reel);
  reelRef.current = reel;

  useEffect(() => {
    if (guestDetail !== undefined) {
      setDetail(guestDetail);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    getHistoryReelDetail(reelRef.current)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [guestDetail, reel.id]);

  return { detail, loading, error };
}

function HistorySuccessDetail({
  onBack,
  reel,
  guestDetail,
}: {
  onBack: () => void;
  reel: HistoryReel;
  guestDetail?: HistoryReelDetail | null;
}) {
  const posthog = usePostHog();
  const {bottom: bottomInset} = useSafeAreaInsets();
  const detailBottomPadding =
    BOTTOM_NAVIGATION_BAR_HEIGHT + getBottomNavigationBarOffset(bottomInset) + 24;
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.id, 'success');
  }, [posthog, reel.id]);
  const { detail, loading, error } = useHistoryReelDetail(reel, guestDetail);
  const displayReel = detail ?? reel;
  const places =
    detail?.extraction?.extraction_places
      .map(item => item.place)
      .filter((place): place is HistoryPlace => Boolean(place)) ?? [];
  const originalUrl = displayReel.instagram_url;

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
      <ScrollView
        contentContainerStyle={[
          styles.detailContent,
          {paddingBottom: detailBottomPadding},
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHero}>
          <Image
            source={displayReel.local_thumbnail_source ?? { uri: displayReel.instagram_thumbnail_url ?? thumbnail }}
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
              // 히스토리의 장소는 보관함 저장 장소가 아니어서 상세 화면(삭제 등)으로 이동하지 않는다.
              <View key={place.id} style={styles.placeCard}>
                <Image
                  source={place.local_thumbnail_source ?? { uri: place.thumbnail_url ?? placeThumbnail }}
                  style={styles.placeImage}
                />
                <Text numberOfLines={1} style={styles.placeName}>
                  {place.name}
                </Text>
                <Text numberOfLines={1} style={styles.placeAddress}>
                  {place.road_address ?? place.address ?? ''}
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
  guestDetail,
  onRequireLogin,
}: {
  onBack: () => void;
  reel: HistoryReel;
  onRetry: () => Promise<void>;
  guestDetail?: HistoryReelDetail | null;
  onRequireLogin?: () => void;
}) {
  const posthog = usePostHog();
  const {bottom: bottomInset} = useSafeAreaInsets();
  const detailBottomPadding =
    BOTTOM_NAVIGATION_BAR_HEIGHT +
    getBottomNavigationBarOffset(bottomInset) +
    (Platform.OS === 'android' ? 48 : 24);
  const [containerHeight, setContainerHeight] = useState(0);
  const availableBodyHeight = Math.max(
    0,
    containerHeight - 84 - detailBottomPadding,
  );
  const compactScale =
    containerHeight === 0
      ? 1
      : Math.max(0.5, Math.min(1, (availableBodyHeight - 187) / 337));
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.id, 'failed');
  }, [posthog, reel.id]);
  const [reported, setReported] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { detail } = useHistoryReelDetail(reel, guestDetail);
  const displayReel = detail ?? reel;
  const originalUrl = displayReel.instagram_url;

  return (
    <View
      onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}
      style={styles.container}
    >
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
      <View
        style={[
          styles.failureContent,
          {paddingBottom: detailBottomPadding},
        ]}
      >
        <View style={[styles.failureHero, {marginTop: 44 * compactScale}]}>
          <Image
            source={{ uri: displayReel.instagram_thumbnail_url ?? thumbnail }}
            resizeMode="cover"
            style={[
              styles.detailThumbnail,
              {
                width: 180 * compactScale,
                height: 226 * compactScale,
              },
            ]}
          />
          <Text
            style={[styles.detailTitle, {marginTop: 24 * compactScale}]}
          >
            장소 분석에 실패했어요ㅠ
          </Text>
          <Text
            style={[styles.failureDescription, {marginTop: 6 * compactScale}]}
          >
            {getHistoryFailureMessage(displayReel.failure_reason)}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              Linking.openURL(originalUrl).catch(() => undefined);
            }
          }}
          style={[
            styles.originalButton,
            styles.failureOriginalButton,
            !originalUrl && styles.disabledButton,
          ]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <View style={styles.failureActions}>
          <Pressable
            disabled={!originalUrl || retrying}
            onPress={() => {
              if (guestDetail !== undefined) {
                onRequireLogin?.();
                return;
              }
              Alert.alert('다시 시도할까요?', '', [
                { text: '취소', style: 'cancel' },
                {
                  text: '확인',
                  onPress: () => {
                    // 접수 응답을 기다리는 동안 버튼에 로딩을 보여 준다.
                    setRetrying(true);
                    onRetry()
                      .catch(() => undefined)
                      .finally(() => setRetrying(false));
                  },
                },
              ]);
            }}
            style={[
              styles.actionButton,
              {marginTop: 24 * compactScale},
              retrying && styles.disabledButton,
            ]}
          >
            {retrying ? (
              <ActivityIndicator color="#2a2a44" size="small" style={styles.actionIcon} />
            ) : (
              <RetryIcon width={20} height={20} style={styles.actionIcon} />
            )}
            <Text style={styles.actionText}>
              {retrying ? '다시 시도하는 중...' : '다시 시도하기'}
            </Text>
          </Pressable>
          <Pressable
            disabled={reported}
            onPress={() => {
              if (guestDetail !== undefined) {
                onRequireLogin?.();
                return;
              }
              Alert.alert('제보할까요?', '', [
                { text: '취소', style: 'cancel' },
                {
                  text: '확인',
                  onPress: () => {
                    setReported(true);
                    reportHistoryReel(reel.id)
                      .catch(() => {
                        setReported(false);
                        Alert.alert('제보하지 못했어요', '잠시 후 다시 시도해주세요.');
                      });
                  },
                },
              ]);
            }}
            style={[
              styles.actionButton,
              styles.reportActionButton,
              {marginTop: 13 * compactScale},
              reported && styles.disabledButton,
            ]}
          >
            <ReportIcon width={20} height={20} style={styles.actionIcon} />
            <Text style={styles.actionText}>
              {reported ? '제보 완료' : '제보하기'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.homeIndicator} />
    </View>
  );
}

/** 처리 중 항목의 상태도 앱 공용 목록 폴링 하나로 갱신한다(단건 폴링 없음). */
const LIST_POLL_INTERVAL_MS = 3000;

export function HistoryScreen({
  onBack,
  guestReels,
  guestDetails,
  onRequireLogin,
}: HistoryScreenProps) {
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
  // 상태값은 다음 렌더까지 바뀌지 않으므로 같은 커서의 더 보기가 겹치지 않게 ref로 막는다.
  const loadingMoreRef = useRef(false);
  // 첫 페이지 다음까지 읽었으면 커서는 더 보기만 갱신한다.
  const hasLoadedMoreRef = useRef(false);
  const [reels, setReels] = useState<HistoryReel[]>(guestReels ?? []);
  const [cursor, setCursor] = useState<HistoryCursor | null>(null);
  const [loading, setLoading] = useState(guestReels === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [error, setError] = useState(false);
  const [selectedSuccess, setSelectedSuccess] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(false);
  const [selectedReel, setSelectedReel] = useState<HistoryReel | null>(null);

  // 폴링 실패 시 이미 보이는 목록을 지우지 않도록 목록이 있는지 기억한다.
  const hasReelsRef = useRef(false);
  hasReelsRef.current = reels.length > 0;
  const showErrorIfEmpty = useCallback(() => {
    if (!hasReelsRef.current) setError(true);
  }, []);

  cardStatesRef.current = new Map(reels.map(reel => {
    const processing = reel.processing_status === 'PENDING' || reel.processing_status === 'PROCESSING';
    const state: HistoryVisibleState =
      (processing && (!reel.instagram_thumbnail_url || !hasResolvedHistoryTitle(reel)))
      ? 'loading' : reel.processing_status === 'COMPLETED' ? 'success'
      : reel.processing_status === 'FAILED' ? 'failed' : 'processing';
    return [reel.id, state];
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
  }, [evaluateVisibleCards, reels]);

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

  const sharesSubscriptionRef = useRef<RecentSharesSubscription | null>(null);

  /** 첫 페이지 결과를 반영한다. 폴링(replace=false)은 더 보기로 불러온 이전 항목을 유지한다. */
  const applyFirstPage = useCallback(async (
    result: RecentSharesSnapshot,
    replace: boolean,
  ) => {
    // This screen is visible while refreshing, so the newest status is
    // already seen by the user and must not create a badge on exit.
    if (result.reels[0]) {
      await setLastSeenHistorySnapshot({
        id: result.reels[0].id,
        status: result.reels[0].processing_status,
      });
    }
    setError(false);
    setReels(current => {
      if (replace) return result.reels;
      const refreshedIds = new Set(result.reels.map(item => item.id));
      return [
        ...result.reels,
        ...current.filter(item => !refreshedIds.has(item.id)),
      ];
    });
    // 폴링은 첫 페이지만 읽은 목록의 커서만 갱신한다. 더 보기로 이어 읽은 뒤에는
    // 커서가 마지막으로 읽은 페이지를 가리키고, 끝까지 읽어 null이면 그대로 둔다.
    if (replace || !hasLoadedMoreRef.current) setCursor(result.nextCursor);
  }, []);

  const load = useCallback(async (nextCursor?: HistoryCursor | null, silent = false) => {
    if (guestReels !== undefined) {
      setReels(guestReels);
      setCursor(null);
      setError(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (nextCursor) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadMoreFailed(false);
      setLoadingMore(true);
    } else if (!silent) {
      setLoadMoreFailed(false);
      hasLoadedMoreRef.current = false;
      setLoading(true);
    }
    setError(false);
    try {
      if (nextCursor) {
        const result = await getHistoryReels(nextCursor);
        setReels(current => {
          // 폴링으로 첫 페이지 경계가 밀리면 이미 가진 항목이 다음 페이지에 다시 올 수 있다.
          const currentIds = new Set(current.map(item => item.id));
          return [...current, ...result.reels.filter(item => !currentIds.has(item.id))];
        });
        hasLoadedMoreRef.current = true;
        setCursor(result.nextCursor);
        return;
      }

      // 첫 페이지는 앱 공용 폴러로 읽어 배지 등 다른 구독자와 결과를 나눈다.
      // 폴링 결과는 구독 콜백이 반영하므로 여기서는 처음 불러올 때만 목록을 바꾼다.
      const subscription = sharesSubscriptionRef.current;
      const result = await (subscription ? subscription.refresh() : getHistoryReels());
      if (!silent || !subscription) await applyFirstPage(result, !silent);
      if (!silent && !historyViewedRef.current) {
        historyViewedRef.current = true;
        requestAnimationFrame(() => trackHistoryViewed(posthog, result.reels.length ? 'list' : 'empty'));
      }
    } catch {
      // 처음 불러올 때만 오류 화면을 보인다. 이전 기록 불러오기 실패는 목록 아래에서,
      // 폴링·재시도 뒤 다시 읽기 실패는 목록을 유지한 채 다음 폴링에 맡긴다.
      if (nextCursor) setLoadMoreFailed(true);
      else if (silent) showErrorIfEmpty();
      else setError(true);
      if (!nextCursor && !silent && !historyViewedRef.current) {
        historyViewedRef.current = true;
        requestAnimationFrame(() => trackHistoryViewed(posthog, 'error'));
      }
    } finally {
      if (nextCursor) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [applyFirstPage, guestReels, posthog, showErrorIfEmpty]);

  /**
   * 재시도도 새 공유와 같은 길을 탄다. 접수에 성공하면 목록으로 돌아가 바로 한 번 읽고,
   * 이후 상태는 목록 폴링이 갱신한다. 실패하면 실패 상세에 머문 채 안내한다.
   */
  const retryHistoryReel = useCallback(async (reel: HistoryReel) => {
    const requestId = uuidv4();
    trackExtractionRequestStarted(posthog, {
      requestId,
      source: 'history_retry',
    });
    let response: Awaited<ReturnType<typeof retryHistoryReelExtraction>>;
    try {
      // 서버 재시도 API는 같은 게시물로 새 공유를 만들고(이미 추출 중이면 그 공유를) 돌려준다.
      response = await retryHistoryReelExtraction(reel.id);
    } catch (retryError) {
      const normalized = normalizeReelError(retryError);
      trackExtractionRequestFinished(posthog, {
        requestId,
        source: 'history_retry',
        outcome: 'request_failed',
        failureType: toExtractionFailureType(normalized),
        responseStatus: normalized.status,
      });
      // MEDIA400_xxx(재시도 불가 등)는 서버 문구를 그대로 보여준다.
      Alert.alert(
        '다시 시도하지 못했어요',
        normalized.errorCode?.startsWith('MEDIA')
          ? normalized.message
          : '잠시 후 다시 시도해주세요.',
      );
      return;
    }
    // 2xx 응답이면 응답 안의 추출 상태가 FAILED여도 응답 수신으로 기록한다.
    trackExtractionRequestFinished(posthog, {
      requestId,
      source: 'history_retry',
      outcome: 'response_received',
      contentId: response.reelId,
    });

    // 이 화면에서 바로 보게 되므로 대기함으로 돌아갈 때 안 읽은 히스토리로 표시하지 않는다.
    await setLastSeenHistorySnapshot({
      id: response.reelId,
      status: response.status,
    }).catch(() => undefined);

    // 새 항목이 맨 위에 생기므로 실패 항목의 스크롤 위치로 되돌리지 않는다.
    scrollOffsetRef.current = 0;
    shouldRestoreScrollRef.current = false;
    setSelectedFailure(false);
    setSelectedReel(null);
    // 같은 게시물을 다시 처리하므로 접수된 공유는 실패 카드의 내용으로 바로 보여 준다.
    // 생성 시각 등 서버 값은 이어지는 목록 조회가 같은 ID로 덮어쓴다.
    if (!response.reused) {
      const acceptedReel: HistoryReel = {
        ...reel,
        id: response.reelId,
        processing_status: response.status,
        failure_reason: null,
        created_at: new Date().toISOString(),
      };
      setReels(current =>
        current.some(item => item.id === acceptedReel.id)
          ? current.map(item => (item.id === acceptedReel.id ? acceptedReel : item))
          : [acceptedReel, ...current],
      );
    }
    await load(undefined, true);
  }, [load, posthog]);

  useEffect(() => {
    if (guestReels !== undefined) return;
    const subscription = subscribeRecentShares({
      intervalMs: LIST_POLL_INTERVAL_MS,
      onResult: result => {
        applyFirstPage(result, false).catch(() => undefined);
      },
      onError: showErrorIfEmpty,
    });
    sharesSubscriptionRef.current = subscription;

    return () => {
      subscription.unsubscribe();
      sharesSubscriptionRef.current = null;
    };
  }, [applyFirstPage, guestReels, showErrorIfEmpty]);

  useEffect(() => {
    load().catch(() => undefined);
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
      const date = formatHistoryDate(reel.created_at);
      groups[date] = groups[date] ? [...groups[date], reel] : [reel];
      return groups;
    },
    {},
  );
  const selectedGuestDetail = guestReels === undefined
    ? undefined
    : guestDetails?.[selectedReel?.id ?? ''] ?? null;

  if (selectedSuccess) {
    return (
      <HistorySuccessDetail
        onBack={() => {
          shouldRestoreScrollRef.current = true;
          setSelectedSuccess(false);
          setSelectedReel(null);
        }}
        reel={selectedReel as HistoryReel}
        guestDetail={selectedGuestDetail}
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
        guestDetail={selectedGuestDetail}
        onRequireLogin={onRequireLogin}
        onRetry={async () => {
          if (guestReels !== undefined) {
            onRequireLogin?.();
            return;
          }
          await retryHistoryReel(selectedReel as HistoryReel);
        }}
      />
    );
  }

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
          <Image
            source={require('../../assets/icons/brand-mark.png')}
            style={styles.brandMark}
          />
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
          // 실패했으면 스크롤마다 다시 요청하지 않고 다시 불러오기 버튼을 기다린다.
          if (reachedBottom && cursor && !loadingMore && !loadMoreFailed) {
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
                  key={reel.id}
                  reel={reel}
                  onLayout={event => {
                    cardLayoutsRef.current.set(reel.id, {
                      group: date,
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    });
                    evaluateVisibleCards();
                  }}
                  onPress={
                    reel.processing_status === 'COMPLETED'
                      ? () => {
                          setSelectedReel(reel);
                          setSelectedSuccess(true);
                        }
                      : reel.processing_status === 'FAILED'
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
        {loadMoreFailed && !loadingMore ? (
          <View>
            <Text style={styles.moreLoadingText}>이전 기록을 불러오지 못했어요.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                load(cursor).catch(() => undefined);
              }}
              style={styles.moreButton}
            >
              <Text style={styles.retryText}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : null}
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
  brandMark: { width: 44, height: 44, borderRadius: 22 },
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
  failureContent: { flex: 1 },
  failureHero: { alignItems: 'center' },
  failureOriginalButton: { marginTop: 49 },
  failureActions: { marginTop: 'auto' },
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
    marginTop: 24,
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
