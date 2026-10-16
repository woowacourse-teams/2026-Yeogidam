import {useEffect, useRef, type Dispatch} from 'react';

import {normalizeReelError} from '../../../entities/content/errors';
import {subscribeRecentShares} from '../../../entities/content/recent-shares-poller';
import type {HistoryReel, ReelProcessingStatus} from '../../../entities/content/types';
import type {SavedPlacesApiError} from '../../../entities/info/types';
import {getSharedSaveState, setSharedSaveState} from '../../../lib/reel-save-state';
import {
  decideReelPollFailure,
  findPolledReel,
  hasReelPollTimedOut,
  REEL_POLL_INTERVAL_MS,
  resolvePollStartedAt,
  type ReelProcessingAction,
} from '../reelProcessing';

type Options = {
  processingReelId: string | null;
  processingReel: ReelProcessingStatus | null;
  dispatch: Dispatch<ReelProcessingAction>;
  /** 폴링이 AUTH401_001로 실패하면 부릅니다. */
  onRequireLogin?: () => void;
  /** 보관함 목록 오류입니다. 폴링은 이 값을 읽지 않지만, 바뀌면 구독을 다시 겁니다. */
  listError: SavedPlacesApiError | null;
};

/**
 * 처리 중인 릴스를 앱 공용 목록 폴러로 3초마다 확인합니다.
 * 찾았는지와 멈출지는 findPolledReel과 decideReelPollFailure가 정하고, 이 훅은 구독과 시작 시각, 놓친 횟수를 들고 결과를 반영합니다.
 * 목록에서 찾은 상태는 공유 상태에도 적어, 완료되면 공유 상태 구독이 마무리하게 합니다.
 */
export function useReelStatusPolling({
  processingReelId,
  processingReel,
  dispatch,
  onRequireLogin,
  listError,
}: Options) {
  const reelPollStartedAtRef = useRef<number | null>(null);
  const reelPollFailureCountRef = useRef(0);

  useEffect(() => {
    if (!processingReelId) {
      reelPollStartedAtRef.current = null;
      reelPollFailureCountRef.current = 0;
      return;
    }

    if (processingReel?.processing_status === 'FAILED') {
      reelPollStartedAtRef.current = null;
      reelPollFailureCountRef.current = 0;
      return;
    }

    let isActive = true;
    reelPollStartedAtRef.current = resolvePollStartedAt(
      reelPollStartedAtRef.current,
      processingReel?.created_at,
      Date.now(),
    );
    const poll = async (recentReels: Promise<HistoryReel[]>) => {
      if (!isActive) return;
      if (hasReelPollTimedOut(reelPollStartedAtRef.current, Date.now())) {
        dispatch({type: 'pollStopped'});
        return;
      }

      // 목록을 찾고 반영하다 난 예외도 조회 실패로 셉니다.
      try {
        let recentReelList: HistoryReel[];
        try {
          recentReelList = await recentReels;
        } catch (statusError) {
          throw normalizeReelError(statusError);
        }
        if (!isActive) return;

        const listing = findPolledReel(
          processingReelId,
          reelPollFailureCountRef.current,
          recentReelList,
        );
        if (listing.type === 'missing') {
          if (__DEV__) {
            console.warn('[InstagramShare][status-response]', {
              reelId: processingReelId,
              result: null,
            });
          }
          reelPollFailureCountRef.current = listing.failureCount;
          if (listing.stop) {
            dispatch({type: 'pollStopped'});
          }
          return;
        }

        const nextStatus = listing.reel;
        reelPollFailureCountRef.current = 0;
        dispatch({type: 'pollReceived', reel: nextStatus});
        if (__DEV__) {
          console.info('[InstagramShare][status-response]', {
            reelId: nextStatus.id,
            status: nextStatus.processing_status,
            failureReason: nextStatus.failure_reason,
          });
        }
        const sharedState = getSharedSaveState();
        if (sharedState?.reel.id === nextStatus.id) {
          setSharedSaveState({
            ...sharedState,
            status: nextStatus.processing_status,
            reel: nextStatus,
          });
        }
        if (nextStatus.processing_status === 'COMPLETED') {
          dispatch({
            type: 'pollCompleted',
            showSaveSuccess: sharedState?.source === 'url_input',
          });
        }
      } catch (pollError) {
        if (!isActive) return;
        const normalizedError = normalizeReelError(pollError);
        const failure = decideReelPollFailure(
          reelPollFailureCountRef.current,
          normalizedError,
        );
        reelPollFailureCountRef.current = failure.failureCount;
        if (__DEV__) {
          console.warn('[InstagramShare][status-error]', {
            reelId: processingReelId,
            errorCode: normalizedError.errorCode ?? null,
            message: normalizedError.message,
            attempt: failure.failureCount,
          });
        }
        if (failure.stop) {
          dispatch({type: 'pollStopped'});
        }
        if (failure.requireLogin) {
          onRequireLogin?.();
        }
      }
    };

    // 히스토리 화면과 배지가 쓰는 앱 공용 목록 폴러를 3초 주기로 구독합니다.
    const subscription = subscribeRecentShares({
      intervalMs: REEL_POLL_INTERVAL_MS,
      onResult: ({reels}) => {
        poll(Promise.resolve(reels)).catch(() => undefined);
      },
      onError: pollError => {
        poll(Promise.reject(pollError)).catch(() => undefined);
      },
    });
    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
    // TODO(review): 몸통이 읽지 않는 listError와, App이 그릴 때마다 새로 만드는 onRequireLogin이 바뀌면
    // 구독을 다시 걸어 다음 목록 조회가 그때부터 3초 뒤로 밀립니다. 동작을 지키려고 의존성에 그대로 둡니다.
  }, [
    dispatch,
    onRequireLogin,
    processingReel?.created_at,
    processingReel?.id,
    processingReel?.processing_status,
    processingReelId,
    listError,
  ]);
}
