import React, { useCallback, useEffect, useRef } from 'react';
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
  type HistoryVisibleState,
} from '../../analytics/placeExtractionEvents';
import {retryHistoryReelExtraction} from '../../entities/content/history-api';
import {normalizeReelError} from '../../entities/content/errors';
import type {HistoryReel, HistoryReelDetail} from '../../entities/content/types';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';
import {HistoryFailureDetail} from './components/HistoryFailureDetail';
import {HistoryItem} from './components/HistoryItem';
import {HistorySuccessDetail} from './components/HistorySuccessDetail';
import {historyStyles} from './components/historyStyles';
import {getHistoryVisibleState, groupHistoryReelsByDate} from './history-format';
import {useHistoryList} from './useHistoryList';
import {useHistorySelection} from './useHistorySelection';

type HistoryScreenProps = {
  onBack: () => void;
  guestReels?: HistoryReel[];
  guestDetails?: Record<string, HistoryReelDetail>;
  onRequireLogin?: () => void;
};

const emptyCharacter =
  'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';

export function HistoryScreen({
  onBack,
  guestReels,
  guestDetails,
  onRequireLogin,
}: HistoryScreenProps) {
  const posthog = usePostHog();
  const {
    status,
    reels,
    more,
    reload,
    loadMore,
    retryLoadMore,
    refreshSilently,
    acceptRetriedReel,
  } = useHistoryList(guestReels, posthog);
  const loading = status === 'loading';
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const groupOffsetsRef = useRef(new Map<string, number>());
  const cardLayoutsRef = useRef(new Map<string, {group: string; y: number; height: number}>());
  const seenCardsRef = useRef(new Set<string>());
  const visibleTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const cardStatesRef = useRef(new Map<string, HistoryVisibleState>());
  const shouldRestoreScrollRef = useRef(false);
  const {selection, openSuccess, openFailure, closeDetail} = useHistorySelection();
  const isDetailOpen = selection.kind !== 'list';

  cardStatesRef.current = new Map(reels.map(reel => [reel.id, getHistoryVisibleState(reel)]));

  const evaluateVisibleCards = useCallback(() => {
    if (isDetailOpen) return;
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
  }, [isDetailOpen, posthog]);

  useEffect(() => {
    evaluateVisibleCards();
  }, [evaluateVisibleCards, reels]);

  useEffect(() => () => {
    visibleTimersRef.current.forEach(clearTimeout);
    visibleTimersRef.current.clear();
  }, []);

  useEffect(() => {
    if (isDetailOpen) {
      visibleTimersRef.current.forEach(clearTimeout);
      visibleTimersRef.current.clear();
    }
  }, [isDetailOpen]);

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
    closeDetail();
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
      acceptRetriedReel(acceptedReel);
    }
    await refreshSilently();
  }, [acceptRetriedReel, closeDetail, posthog, refreshSilently]);

  useEffect(() => {
    if (
      isDetailOpen ||
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
  }, [isDetailOpen, loading, reels.length]);

  const groupedReels = groupHistoryReelsByDate(reels);
  /** 비회원이면 체험 상세(없으면 null)를, 회원이면 undefined를 넘겨 상세가 서버에 묻게 합니다. */
  const guestDetailOf = (reel: HistoryReel) =>
    guestReels === undefined ? undefined : guestDetails?.[reel.id] ?? null;

  if (selection.kind === 'success') {
    return (
      <HistorySuccessDetail
        onBack={() => {
          shouldRestoreScrollRef.current = true;
          closeDetail();
        }}
        reel={selection.reel}
        guestDetail={guestDetailOf(selection.reel)}
      />
    );
  }
  if (selection.kind === 'failure') {
    return (
      <HistoryFailureDetail
        onBack={() => {
          shouldRestoreScrollRef.current = true;
          closeDetail();
        }}
        reel={selection.reel}
        guestDetail={guestDetailOf(selection.reel)}
        onRequireLogin={onRequireLogin}
        onRetry={async () => {
          if (guestReels !== undefined) {
            onRequireLogin?.();
            return;
          }
          await retryHistoryReel(selection.reel);
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
          if (reachedBottom) loadMore();
        }}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.stateText}>히스토리를 불러오는 중이에요.</Text>
        ) : status === 'error' ? (
          <View style={styles.stateBody}>
            <Text style={styles.stateText}>히스토리를 불러오지 못했어요.</Text>
            <Pressable onPress={() => reload()} style={styles.retryButton}>
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
                      ? () => openSuccess(reel)
                      : reel.processing_status === 'FAILED'
                      ? () => openFailure(reel)
                      : undefined
                  }
                />
              ))}
            </View>
          ))
        )}
        {more === 'loading' ? <Text style={styles.moreLoadingText}>이전 기록을 불러오는 중이에요.</Text> : null}
        {more === 'error' ? (
          <View>
            <Text style={styles.moreLoadingText}>이전 기록을 불러오지 못했어요.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => retryLoadMore()}
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
