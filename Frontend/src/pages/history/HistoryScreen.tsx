import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {v4 as uuidv4} from 'uuid';
import {
  toExtractionFailureType,
  trackExtractionRequestFinished,
  trackExtractionRequestStarted,
  trackHistoryContentViewed,
  trackHistoryViewed,
  type HistoryVisibleState,
} from '../../analytics/placeExtractionEvents';
import {
  getHistoryReels,
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
  HistoryReel,
  HistoryReelDetail,
} from '../../entities/content/types';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';
import {HistoryFailureDetail} from './components/HistoryFailureDetail';
import {HistoryItem} from './components/HistoryItem';
import {HistorySuccessDetail} from './components/HistorySuccessDetail';
import {historyStyles} from './components/historyStyles';
import {getHistoryVisibleState, groupHistoryReelsByDate} from './history-format';

type HistoryScreenProps = {
  onBack: () => void;
  guestReels?: HistoryReel[];
  guestDetails?: Record<string, HistoryReelDetail>;
  onRequireLogin?: () => void;
};

const emptyCharacter =
  'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';

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

  cardStatesRef.current = new Map(reels.map(reel => [reel.id, getHistoryVisibleState(reel)]));

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

  const groupedReels = groupHistoryReelsByDate(reels);
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
    <View style={historyStyles.container}>
      <View style={historyStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대기함으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={historyStyles.backButton}
        >
          <Image
            source={require('../../assets/icons/brand-mark.png')}
            style={styles.brandMark}
          />
        </Pressable>
        <Text style={historyStyles.headerTitle}>히스토리</Text>
        <View style={historyStyles.headerSpacer} />
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
          groupedReels.map(([date, dateReels]) => (
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
      <View style={historyStyles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  brandMark: { width: 44, height: 44, borderRadius: 22 },
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
  instagramIcon: { width: 28, height: 27 },
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
});
