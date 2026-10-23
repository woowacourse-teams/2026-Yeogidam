import {useCallback, useEffect, useReducer, useRef} from 'react';

import type {AnalyticsClient} from '../../analytics/analytics';
import {trackHistoryViewed} from '../../analytics/placeExtractionEvents';
import {getHistoryReels} from '../../entities/content/history-api';
import {
  subscribeRecentShares,
  type RecentSharesSnapshot,
  type RecentSharesSubscription,
} from '../../entities/content/recent-shares-poller';
import type {HistoryCursor, HistoryReel} from '../../entities/content/types';
import {setLastSeenHistorySnapshot} from '../../lib/history-notification-storage';
import {canLoadMore, createHistoryListState, historyListReducer} from './history-list';

/** 처리 중 항목의 상태도 앱 공용 목록 폴링 하나로 갱신한다(단건 폴링 없음). */
const LIST_POLL_INTERVAL_MS = 3000;

/**
 * 첫 페이지의 맨 위 항목을 본 히스토리로 기록합니다. 히스토리 화면이 보이는 동안 읽은 상태는 사용자가
 * 이미 보았으므로 화면을 나갈 때 배지를 만들지 않아야 합니다.
 */
async function rememberNewestAsSeen(page: RecentSharesSnapshot) {
  const newest = page.reels[0];
  if (newest) {
    await setLastSeenHistorySnapshot({id: newest.id, status: newest.processing_status});
  }
}

/**
 * 히스토리 목록을 페이지 단위로 읽고 앱 공용 폴러로 첫 페이지를 갱신합니다. 첫 페이지 읽기는 목록을
 * 가리고 처음부터 읽고, 첫 페이지 다시 읽기는 목록을 둔 채 읽으며, 이전 기록 읽기는 커서 다음 페이지를
 * 이어 읽습니다. 상태 전환은 history-list.ts의 리듀서에 있습니다.
 *
 * @param guestReels 비회원 체험 목록입니다. 있으면 서버에 묻지 않고 폴링도 하지 않습니다.
 * @param posthog 첫 페이지 결과로 히스토리 조회 지표를 화면마다 한 번 남길 때 씁니다.
 * @param isActive 화면이 보이는지입니다. 보이지 않는 동안에는 목록 폴링을 구독하지 않고, 다시 보이면 다시 구독합니다.
 */
export function useHistoryList(
  guestReels: HistoryReel[] | undefined,
  posthog: AnalyticsClient | null | undefined,
  isActive = true,
) {
  const [state, dispatch] = useReducer(historyListReducer, guestReels, createHistoryListState);
  // 상태값은 다음 렌더까지 바뀌지 않으므로 같은 커서의 더 보기가 겹치지 않게 ref로 막는다.
  const loadingMoreRef = useRef(false);
  const historyViewedRef = useRef(false);
  const sharesSubscriptionRef = useRef<RecentSharesSubscription | null>(null);

  /** 폴링이나 다시 읽기로 받은 첫 페이지를 반영합니다. 더 보기로 불러온 이전 항목은 그대로 둡니다. */
  const applyRefreshedPage = useCallback(async (page: RecentSharesSnapshot) => {
    await rememberNewestAsSeen(page);
    dispatch({type: 'refreshLoaded', page});
  }, []);

  /**
   * 첫 페이지를 처음부터 읽습니다. 읽는 동안 목록 대신 불러오는 중 문구를, 실패하면 오류 화면을 보이고,
   * 결과로 히스토리 조회 지표를 화면마다 한 번 남깁니다. 처음 열 때와 오류 화면의 다시 시도가 씁니다.
   */
  const loadFirstPage = useCallback(async () => {
    if (guestReels !== undefined) {
      dispatch({type: 'guestReelsLoaded', reels: guestReels});
      return;
    }
    const trackViewedOnce = (viewState: 'list' | 'empty' | 'error') => {
      if (historyViewedRef.current) return;
      historyViewedRef.current = true;
      requestAnimationFrame(() => trackHistoryViewed(posthog, viewState));
    };

    dispatch({type: 'firstPageRequested'});
    try {
      // 첫 페이지는 앱 공용 폴러로 읽어 배지 등 다른 구독자와 결과를 나눈다.
      const subscription = sharesSubscriptionRef.current;
      const page = await (subscription ? subscription.refresh() : getHistoryReels());
      await rememberNewestAsSeen(page);
      dispatch({type: 'firstPageLoaded', page});
      trackViewedOnce(page.reels.length ? 'list' : 'empty');
    } catch {
      dispatch({type: 'firstPageFailed'});
      trackViewedOnce('error');
    }
  }, [guestReels, posthog]);

  /**
   * 목록을 가리지 않고 첫 페이지를 다시 읽습니다. 재시도 접수 뒤에 씁니다. 폴러를 구독 중이면 결과는
   * 구독 콜백이 반영하고, 실패하면 목록을 둔 채 다음 폴링에 맡깁니다.
   */
  const refreshFirstPage = useCallback(async () => {
    // 비회원은 서버에 묻지 않는다.
    if (guestReels !== undefined) return;
    dispatch({type: 'refreshRequested'});
    try {
      const subscription = sharesSubscriptionRef.current;
      if (subscription) {
        await subscription.refresh();
      } else {
        await applyRefreshedPage(await getHistoryReels());
      }
    } catch {
      dispatch({type: 'refreshFailed'});
    }
  }, [applyRefreshedPage, guestReels]);

  /**
   * 커서 다음의 이전 기록을 이어 읽습니다. 실패하면 실패한 커서를 상태에 남겨, 폴링이 커서를 바꾼
   * 뒤에도 다시 불러오기가 같은 페이지를 읽게 합니다.
   */
  const loadMorePage = useCallback(async (cursor: HistoryCursor) => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    dispatch({type: 'morePageRequested'});
    try {
      const page = await getHistoryReels(cursor);
      dispatch({type: 'morePageLoaded', page});
    } catch {
      dispatch({type: 'morePageFailed', cursor});
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isActive || guestReels !== undefined) return;
    const subscription = subscribeRecentShares({
      intervalMs: LIST_POLL_INTERVAL_MS,
      onResult: page => {
        applyRefreshedPage(page);
      },
      onError: () => dispatch({type: 'refreshFailed'}),
    });
    sharesSubscriptionRef.current = subscription;

    return () => {
      subscription.unsubscribe();
      sharesSubscriptionRef.current = null;
    };
  }, [applyRefreshedPage, guestReels, isActive]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  /** 맨 아래까지 스크롤했을 때 이전 기록을 이어 읽습니다. 실패했으면 다시 불러오기 버튼을 기다립니다. */
  const loadMore = useCallback(() => {
    if (canLoadMore(state)) loadMorePage(state.cursor);
  }, [loadMorePage, state]);

  /** 실패한 커서로 이전 기록을 다시 읽습니다. 목록 아래의 다시 불러오기 버튼이 씁니다. */
  const retryLoadMore = useCallback(() => {
    if (state.more.status === 'error') loadMorePage(state.more.cursor);
  }, [loadMorePage, state.more]);

  /** 재시도로 접수된 공유를 목록 맨 앞에 넣거나 같은 ID의 항목을 바꿉니다. */
  const acceptRetriedReel = useCallback(
    (reel: HistoryReel) => dispatch({type: 'retryAccepted', reel}),
    [],
  );

  return {...state, loadFirstPage, refreshFirstPage, loadMore, retryLoadMore, acceptRetriedReel};
}
