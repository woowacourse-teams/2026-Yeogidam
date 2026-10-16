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
 * 히스토리 목록을 페이지 단위로 읽고 앱 공용 폴러로 첫 페이지를 갱신합니다.
 * 상태 전환은 history-list.ts의 리듀서에 있고, 이 훅은 요청을 보내고 결과를 동작으로 넘깁니다.
 *
 * @param guestReels 비회원 체험 목록입니다. 있으면 서버에 묻지 않고 폴링도 하지 않습니다.
 * @param posthog 첫 페이지 결과로 히스토리 조회 지표를 화면마다 한 번 남길 때 씁니다.
 */
export function useHistoryList(
  guestReels: HistoryReel[] | undefined,
  posthog: AnalyticsClient | null | undefined,
) {
  const [state, dispatch] = useReducer(historyListReducer, guestReels, createHistoryListState);
  // 상태값은 다음 렌더까지 바뀌지 않으므로 같은 커서의 더 보기가 겹치지 않게 ref로 막는다.
  const loadingMoreRef = useRef(false);
  const historyViewedRef = useRef(false);
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
    dispatch(replace ? {type: 'firstPageLoaded', page: result} : {type: 'refreshLoaded', page: result});
  }, []);

  const load = useCallback(async (nextCursor?: HistoryCursor | null, silent = false) => {
    if (guestReels !== undefined) {
      dispatch({type: 'guestReelsLoaded', reels: guestReels});
      return;
    }
    if (nextCursor) {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      dispatch({type: 'morePageRequested'});
    } else {
      dispatch({type: silent ? 'refreshRequested' : 'firstPageRequested'});
    }
    try {
      if (nextCursor) {
        const result = await getHistoryReels(nextCursor);
        dispatch({type: 'morePageLoaded', page: result});
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
      // 폴링이나 재시도 뒤 다시 읽기 실패는 목록을 유지한 채 다음 폴링에 맡긴다.
      if (nextCursor) dispatch({type: 'morePageFailed'});
      else if (silent) dispatch({type: 'refreshFailed'});
      else dispatch({type: 'firstPageFailed'});
      if (!nextCursor && !silent && !historyViewedRef.current) {
        historyViewedRef.current = true;
        requestAnimationFrame(() => trackHistoryViewed(posthog, 'error'));
      }
    } finally {
      if (nextCursor) loadingMoreRef.current = false;
    }
  }, [applyFirstPage, guestReels, posthog]);

  useEffect(() => {
    if (guestReels !== undefined) return;
    const subscription = subscribeRecentShares({
      intervalMs: LIST_POLL_INTERVAL_MS,
      onResult: result => {
        applyFirstPage(result, false).catch(() => undefined);
      },
      onError: () => dispatch({type: 'refreshFailed'}),
    });
    sharesSubscriptionRef.current = subscription;

    return () => {
      subscription.unsubscribe();
      sharesSubscriptionRef.current = null;
    };
  }, [applyFirstPage, guestReels]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  /** 첫 페이지를 처음부터 다시 읽습니다. 오류 화면의 다시 시도가 씁니다. */
  const reload = useCallback(() => load(), [load]);

  /** 맨 아래까지 스크롤했을 때 이전 기록을 이어 읽습니다. 실패했으면 다시 불러오기 버튼을 기다립니다. */
  const loadMore = useCallback(() => {
    if (canLoadMore(state)) load(state.cursor).catch(() => undefined);
  }, [load, state]);

  /** 이전 기록 불러오기를 지금 커서로 다시 시도합니다. 목록 아래의 다시 불러오기 버튼이 씁니다. */
  const retryLoadMore = useCallback(() => {
    // TODO(review): 실패 뒤 폴링이 커서를 null로 바꾸면 버튼은 남고, 누르면 첫 페이지를 처음부터 읽습니다. 기존 동작이라 그대로 둡니다.
    load(state.cursor).catch(() => undefined);
  }, [load, state.cursor]);

  /** 목록을 가리지 않고 첫 페이지를 다시 읽습니다. 결과는 폴러 구독 콜백이 반영합니다. */
  const refreshSilently = useCallback(() => load(undefined, true), [load]);

  /** 재시도로 접수된 공유를 목록 맨 앞에 넣거나 같은 ID의 항목을 바꿉니다. */
  const acceptRetriedReel = useCallback(
    (reel: HistoryReel) => dispatch({type: 'retryAccepted', reel}),
    [],
  );

  return {...state, reload, loadMore, retryLoadMore, refreshSilently, acceptRetriedReel};
}
