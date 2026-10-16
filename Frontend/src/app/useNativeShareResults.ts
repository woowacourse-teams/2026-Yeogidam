import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

import {getSpringTokens} from '../lib/auth/spring-session';
import {captureShareLoginHandoffError} from '../lib/monitoring/share-errors';
import {getSharedSaveState, setSharedSaveState} from '../lib/reel-save-state';
import {
  clearShareResult,
  getShareResults,
  resumeWaitingShares,
  type NativeShareResult,
} from '../lib/share-intent';
import {classifyShareResult, selectShareResult} from '../lib/share-intent/select-share-result';
import {toSharedSaveState} from '../pages/saved-places/reelProcessing';

const RESULT_POLL_INTERVAL_MS = 1000;

/**
 * 공유 결과가 실패로 끝나 사용자에게 안내할 종류입니다.
 * session-expired는 세션이 있는데 익스텐션 쪽 로그인이 만료된 경우, login-required는 세션이 없는 경우입니다.
 */
export type ShareFailureNotice = 'session-expired' | 'login-required' | 'extraction-failed';

export type NativeShareResultHandlers = {
  /** 비회원이 공유했을 때 로그인 화면으로 보내고, 돌아올 비회원 화면을 기억합니다. */
  onGuestLoginPrompt: () => void;
  /** 비회원 체험이나 로그인 안내 뒤, 또는 진행 중인 공유를 보여 주려고 보관함 탭을 엽니다. */
  onOpenSavedPlaces: (reason: 'guest-preview' | 'share-progress') => void;
  /** 세션이 없어 로그인 화면으로 보냅니다. */
  onLoginRequired: () => void;
  /** 공유 결과가 실패로 끝나 안내가 필요합니다. login-required는 onLoginRequired 뒤에 옵니다. */
  onShareFailed: (notice: ShareFailureNotice) => void;
};

/**
 * 공유 익스텐션이 App Group에 남긴 결과를 앱이 활성 상태일 때 1초마다 읽어 화면 흐름으로 바꿉니다.
 * 화면 이동은 handlers로 넘기므로 이 훅은 내비게이션 상태를 모릅니다.
 */
export function useNativeShareResults(enabled: boolean, handlers: NativeShareResultHandlers) {
  const [hasPendingShareLogin, setHasPendingShareLogin] = useState(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const lastHandledShareResultRef = useRef<string | null>(null);
  const lastLoggedShareResultsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isMounted = true;

    const logResults = (results: NativeShareResult[], activeRequestId: string | undefined) => {
      if (!__DEV__) return;
      const resultSummary = results.map(item =>
        [
          `requestId=${item.requestId ?? 'none'}`,
          `status=${item.status}`,
          `reelId=${item.reelId ?? 'none'}`,
          `failureReason=${item.failureReason ?? 'none'}`,
          `retryable=${item.retryable ?? false}`,
          `updatedAt=${item.updatedAt}`,
        ].join(' | '),
      );
      const resultSnapshot = JSON.stringify({activeRequestId: activeRequestId ?? null, resultSummary});
      if (lastLoggedShareResultsRef.current === resultSnapshot) return;
      lastLoggedShareResultsRef.current = resultSnapshot;
      console.log(
        '[InstagramShare][native-results]',
        `activeRequestId=${activeRequestId ?? 'none'}`,
        ...resultSummary,
      );
    };

    const handleResult = (result: NativeShareResult) => {
      const action = classifyShareResult(result);
      if (__DEV__) {
        console.log('[InstagramShare][native-result-selected]', {
          action,
          requestId: result.requestId ?? null,
          requestSentAt: result.requestSentAt ?? null,
          url: result.url,
          status: result.status,
          reelId: result.reelId ?? null,
          failureReason: result.failureReason ?? null,
          retryable: result.retryable ?? null,
          updatedAt: result.updatedAt,
          reused: result.reused ?? null,
          saveMode: result.saveMode ?? null,
        });
      }

      switch (action) {
        case 'guest-login-prompt':
          clearShareResult(result.requestId).catch(() => undefined);
          setSharedSaveState(null);
          handlersRef.current.onGuestLoginPrompt();
          return;
        case 'open-saved-places':
          clearShareResult(result.requestId).catch(() => undefined);
          handlersRef.current.onOpenSavedPlaces('guest-preview');
          return;
        case 'login-handoff':
          getSpringTokens()
            .then(tokens => {
              if (tokens) {
                resumeWaitingShares().catch(() => undefined);
                return;
              }
              handlersRef.current.onLoginRequired();
            })
            .catch(() => {
              captureShareLoginHandoffError('SHARE_LOGIN_STATE_READ_FAILED');
              handlersRef.current.onLoginRequired();
            });
          return;
        case 'auth-failed':
          clearShareResult(result.requestId).catch(() => undefined);
          // 추출 실패가 아니라 로그인 문제이므로 다시 로그인하거나 다시 공유하도록 안내합니다.
          getSpringTokens()
            .then(tokens => {
              if (tokens) {
                handlersRef.current.onShareFailed('session-expired');
                return;
              }
              handlersRef.current.onLoginRequired();
              handlersRef.current.onShareFailed('login-required');
            })
            .catch(() => undefined);
          return;
        case 'extraction-failed':
          clearShareResult(result.requestId).catch(() => undefined);
          handlersRef.current.onShareFailed('extraction-failed');
          return;
        case 'wait':
          return;
        case 'show-progress':
          setSharedSaveState(toSharedSaveState(result, Date.now()));
          handlersRef.current.onOpenSavedPlaces('share-progress');
          return;
      }
    };

    const consumePendingSharedContent = () => {
      getShareResults()
        .then(results => {
          if (!isMounted) {
            return;
          }
          setHasPendingShareLogin(results.some(item => item.transferStatus === 'LOGIN_HANDOFF'));
          const currentShareState = getSharedSaveState();
          const activeRequestId =
            currentShareState?.source === 'instagram_share'
              ? currentShareState.shareResultId
              : undefined;
          logResults(results, activeRequestId);

          const result = selectShareResult(results, activeRequestId);
          if (!result) {
            lastHandledShareResultRef.current = null;
            if (currentShareState?.source === 'instagram_share') {
              setSharedSaveState(null);
            }
            return;
          }

          // 같은 결과를 폴링마다 다시 처리하지 않도록 요청과 갱신 시각으로 구분합니다.
          const resultKey = `${result.requestId ?? result.url}:${result.updatedAt}`;
          if (lastHandledShareResultRef.current === resultKey) return;
          lastHandledShareResultRef.current = resultKey;
          handleResult(result);
        })
        .catch(error => {
          if (__DEV__) {
            console.error('[InstagramShare][native-results-error]', error);
          }
        });
    };

    consumePendingSharedContent();

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        resumeWaitingShares()
          .then(consumePendingSharedContent)
          .catch(consumePendingSharedContent);
      }
    });
    const resultPollId = setInterval(() => {
      if (AppState.currentState === 'active') consumePendingSharedContent();
    }, RESULT_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      clearInterval(resultPollId);
    };
  }, [enabled]);

  /** 로그인 화면에서 "공유 로그인 취소"를 누르면 넘겨받은 공유를 지웁니다. */
  const cancelPendingShareLogin = useCallback(async () => {
    const results = await getShareResults();
    await Promise.all(
      results
        .filter(result => result.transferStatus === 'LOGIN_HANDOFF')
        .map(result => clearShareResult(result.requestId)),
    );
    setHasPendingShareLogin(false);
  }, []);

  /** 로그인에 성공하면 넘겨받은 공유는 재개 흐름이 처리하므로 표시만 내립니다. */
  const resetPendingShareLogin = useCallback(() => {
    setHasPendingShareLogin(false);
  }, []);

  return {hasPendingShareLogin, cancelPendingShareLogin, resetPendingShareLogin};
}
