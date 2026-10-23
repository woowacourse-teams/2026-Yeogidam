import React, {useCallback, useEffect} from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {SwipeBackStack} from '../../components/navigation/SwipeBackStack';
import type {HistoryReel, HistoryReelDetail} from '../../entities/content/types';
import {HistoryFailureDetail} from './components/HistoryFailureDetail';
import {HistoryItem} from './components/HistoryItem';
import {HistorySuccessDetail} from './components/HistorySuccessDetail';
import {historyStyles} from './components/historyStyles';
import {getHistoryCardDetail, groupHistoryReelsByDate} from './history-format';
import {useHistoryCardImpressions} from './useHistoryCardImpressions';
import {useHistoryList} from './useHistoryList';
import {useHistoryRetry} from './useHistoryRetry';
import {useHistoryScrollRestore} from './useHistoryScrollRestore';
import {useHistorySelection} from './useHistorySelection';

type HistoryScreenProps = {
  isActive?: boolean;
  onBack: () => void;
  onNestedBackStateChange?: (canGoBack: boolean) => void;
  guestReels?: HistoryReel[];
  guestDetails?: Record<string, HistoryReelDetail>;
  onRequireLogin?: () => void;
};

/**
 * 공유한 콘텐츠의 장소 분석 기록을 날짜별로 보이고, 항목을 누르면 성공 또는 실패 상세를 엽니다.
 * 목록 읽기, 상세 선택, 스크롤 복원, 카드 노출 지표, 재시도는 각 훅이 맡고, 이 화면은 훅을 이어
 * 목록이나 상세를 그립니다. 비회원이면 guestReels와 guestDetails만 보이고 서버에 묻지 않습니다.
 * 목록과 상세는 화면 이력 스택(SwipeBackStack)에 함께 두어, 왼쪽 가장자리 스와이프와 Android 시스템
 * 뒤로 가기로도 상세에서 목록으로 돌아갑니다. 화면이 보이지 않는 동안(isActive가 false)에는 목록 폴링과
 * 카드 노출 판단을 멈춥니다.
 */
export function HistoryScreen({
  isActive = true,
  onBack,
  onNestedBackStateChange,
  guestReels,
  guestDetails,
  onRequireLogin,
}: HistoryScreenProps) {
  const posthog = usePostHog();
  const {
    status,
    reels,
    more,
    loadFirstPage,
    refreshFirstPage,
    loadMore,
    retryLoadMore,
    acceptRetriedReel,
  } = useHistoryList(guestReels, posthog, isActive);
  const loading = status === 'loading';
  const {selection, openDetail, closeDetail} = useHistorySelection();
  const isDetailOpen = selection.kind !== 'list';
  const {scrollViewRef, scrollOffsetRef, recordScrollOffset, restoreOnReturn, resetToTop} =
    useHistoryScrollRestore({listVisible: !isDetailOpen, loading, reelCount: reels.length});
  const {evaluateVisibleCards, onViewportLayout, onGroupLayout, onCardLayout} =
    useHistoryCardImpressions({
      posthog,
      reels,
      paused: !isActive || isDetailOpen,
      scrollOffsetRef,
    });
  const {retryReel} = useHistoryRetry(posthog);

  /**
   * 재시도도 새 공유와 같은 길을 탄다. 접수에 성공하면 목록으로 돌아가 바로 한 번 읽고,
   * 이후 상태는 목록 폴링이 갱신한다. 실패하면 실패 상세에 머문 채 안내한다.
   */
  const handleRetry = async (reel: HistoryReel) => {
    const outcome = await retryReel(reel);
    if (outcome.status === 'failed') {
      Alert.alert('다시 시도하지 못했어요', outcome.message);
      return;
    }
    // 새 항목이 맨 위에 생기므로 실패 항목의 스크롤 위치로 되돌리지 않는다.
    resetToTop();
    closeDetail();
    if (outcome.acceptedReel) acceptRetriedReel(outcome.acceptedReel);
    await refreshFirstPage();
  };

  /** 상세를 닫고 목록이 다시 보이면 보던 스크롤 위치로 되돌립니다. 상세의 뒤로 가기 버튼, 스와이프, Android 시스템 뒤로 가기가 함께 씁니다. */
  const backToList = useCallback(() => {
    restoreOnReturn();
    closeDetail();
  }, [closeDetail, restoreOnReturn]);

  // 상세가 열려 있으면 App에 뒤로 갈 수 있다고 알리고, Android에서는 시스템 뒤로 가기로 목록에 돌아간다.
  useEffect(() => {
    const canGoBack = isActive && isDetailOpen;
    onNestedBackStateChange?.(canGoBack);
    if (Platform.OS !== 'android' || !canGoBack) {
      return () => onNestedBackStateChange?.(false);
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      backToList();
      return true;
    });

    return () => {
      subscription.remove();
      onNestedBackStateChange?.(false);
    };
  }, [backToList, isActive, isDetailOpen, onNestedBackStateChange]);

  const groupedReels = groupHistoryReelsByDate(reels);
  /** 비회원이면 체험 상세(없으면 null)를, 회원이면 undefined를 넘겨 상세가 서버에 묻게 합니다. */
  const guestDetailOf = (reel: HistoryReel) =>
    guestReels === undefined ? undefined : guestDetails?.[reel.id] ?? null;
  /** 카드를 눌렀을 때 쓸 동작을 돌려줍니다. 카드 상태 표에 열 상세가 없는 카드(처리 중)에는 undefined를 돌려줘 누를 수 없습니다. */
  const toCardPressHandler = (reel: HistoryReel) => {
    const detail = getHistoryCardDetail(reel);
    return detail ? () => openDetail(detail, reel) : undefined;
  };

  const detailContent =
    selection.kind === 'success' ? (
      <HistorySuccessDetail
        onBack={backToList}
        reel={selection.reel}
        guestDetail={guestDetailOf(selection.reel)}
      />
    ) : selection.kind === 'failure' ? (
      <HistoryFailureDetail
        onBack={backToList}
        reel={selection.reel}
        guestDetail={guestDetailOf(selection.reel)}
        onRequireLogin={onRequireLogin}
        onRetry={() => handleRetry(selection.reel)}
      />
    ) : null;

  const listContent = (
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
        onLayout={event => onViewportLayout(event.nativeEvent.layout.height)}
        contentContainerStyle={[
          styles.content,
          !loading && reels.length === 0 && styles.emptyContent,
        ]}
        onScroll={({nativeEvent}) => {
          recordScrollOffset(nativeEvent.contentOffset.y);
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
            <Pressable onPress={() => loadFirstPage()} style={styles.retryButton}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : reels.length === 0 ? (
          <View style={styles.emptyBody}>
            <Image
              source={require('../../assets/illustrations/dami-empty-box-small-cropped.png')}
              style={styles.emptyCharacter}
            />
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>아직 공유된 콘텐츠가 없어요</Text>
              <Text style={styles.emptyDescription}>
                {guestReels !== undefined ? (
                  <>로그인하고 공유한 콘텐츠의{'\n'}장소 추출 결과를 확인해보세요.</>
                ) : (
                  <>인스타그램 릴스를 공유하고 장소 추출 결과를{'\n'}확인해보세요.</>
                )}
              </Text>
              {guestReels !== undefined ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="히스토리 로그인"
                  onPress={onRequireLogin}
                  style={({pressed}) => [
                    styles.emptyLoginButton,
                    pressed && styles.emptyLoginButtonPressed,
                  ]}>
                  <Text style={styles.emptyLoginButtonText}>로그인하기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          groupedReels.map(([date, dateReels]) => (
            <View
              key={date}
              style={styles.group}
              onLayout={event => onGroupLayout(date, event.nativeEvent.layout.y)}
            >
              <Text style={styles.date}>{date}</Text>
              {dateReels.map(reel => (
                <HistoryItem
                  key={reel.id}
                  reel={reel}
                  onLayout={event =>
                    onCardLayout(reel.id, {
                      group: date,
                      y: event.nativeEvent.layout.y,
                      height: event.nativeEvent.layout.height,
                    })
                  }
                  onPress={toCardPressHandler(reel)}
                />
              ))}
            </View>
          ))
        )}
        {more.status === 'loading' ? <Text style={styles.moreLoadingText}>이전 기록을 불러오는 중이에요.</Text> : null}
        {more.status === 'error' ? (
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

  return (
    <SwipeBackStack
      activeKey={detailContent ? 'detail' : 'list'}
      backKey={detailContent ? 'list' : null}
      onBack={backToList}
      enabled={isActive}
      screens={[
        {key: 'list', content: listContent},
        ...(detailContent ? [{key: 'detail', content: detailContent}] : []),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  brandMark: { width: 44, height: 44, borderRadius: 22 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  emptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 112,
    paddingHorizontal: 24,
  },
  emptyBody: { alignItems: 'center', width: '100%' },
  emptyCharacter: {
    width: 250,
    height: 183,
    transform: [{translateX: -16}],
    marginBottom: 24,
  },
  emptyText: { alignItems: 'center', width: '100%' },
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
  emptyLoginButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1F2238',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  emptyLoginButtonPressed: { opacity: 0.82 },
  emptyLoginButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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
