import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {AppState} from 'react-native';

import type {AnalyticsClient} from '../analytics/analytics';
import {trackGuestTransferFinished} from '../analytics/userEntryEvents';
import {
  beginGuestOnboardingTransfer,
  cancelGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
  toOnboardingKakaoPlaceIds,
} from '../entities/onboarding/transfer';
import type {Place} from '../entities/place/types';
import {getSpringMemberId} from '../lib/auth/spring-session';

type Options = {
  /** 회원으로 확인된 동안만 포그라운드 복귀 때 전환을 다시 시도합니다. */
  enabled: boolean;
  /** 지금 로그인한 회원 ID입니다. 응답이 돌아왔을 때 다른 회원이면 결과를 버립니다. */
  activeMemberIdRef: MutableRefObject<string | null>;
  posthog: AnalyticsClient | null | undefined;
  /** 옮기기가 실패해 사용자에게 안내해야 할 때 부릅니다. 한 세션에 한 번만 부르고, resetTransferError로 되돌립니다. */
  onTransferFailed: () => void;
};

/**
 * 비회원 체험 장소를 가입한 회원의 보관함으로 옮기는 흐름(#295)을 맡습니다.
 * 로그인 시작 때 기록하고, 세션이 확인되면 보내고, 앱을 다시 열면 남은 기록을 재시도합니다.
 * 옮기기가 끝나면 memberDataRevision을 올려 화면이 회원 데이터를 다시 읽게 합니다.
 */
export function useGuestOnboardingTransfer({
  enabled,
  activeMemberIdRef,
  posthog,
  onTransferFailed,
}: Options) {
  const [memberDataRevision, setMemberDataRevision] = useState(0);
  const transferErrorShownRef = useRef(false);
  const isMountedRef = useRef(true);
  // 안내 콜백은 렌더마다 새로 올 수 있으므로 ref로 읽어 resumeTransfer의 참조를 고정합니다.
  const onTransferFailedRef = useRef(onTransferFailed);
  onTransferFailedRef.current = onTransferFailed;

  // Fast Refresh나 StrictMode처럼 effect가 다시 돌 때도 응답을 버리지 않게 setup에서 true로 되돌립니다.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** 세션 확인이나 로그인 직후에 부릅니다. 실패 안내 요청(onTransferFailed)은 한 세션에 한 번만 보냅니다. */
  const resumeTransfer = useCallback(
    (memberId: string, isNewMember?: boolean) => {
      resumeGuestOnboardingTransfer(memberId, isNewMember)
        .then(completed => {
          if (completed) trackGuestTransferFinished(posthog, 'success');
          if (!isMountedRef.current || !completed || activeMemberIdRef.current !== memberId) {
            return;
          }
          transferErrorShownRef.current = false;
          setMemberDataRevision(revision => revision + 1);
        })
        .catch(error => {
          trackGuestTransferFinished(posthog, 'failure');
          console.warn('군자역 게시물 저장 실패', error);
          if (
            !isMountedRef.current ||
            activeMemberIdRef.current !== memberId ||
            transferErrorShownRef.current
          ) {
            return;
          }
          transferErrorShownRef.current = true;
          onTransferFailedRef.current();
        });
    },
    [activeMemberIdRef, posthog],
  );

  // 앱을 다시 열 때 남은 기록을 조용히 재시도합니다. 안내와 지표는 세션 확인 경로가 맡습니다.
  useEffect(() => {
    if (!enabled) return;

    let isActive = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      getSpringMemberId()
        .then(memberId => {
          if (!memberId) return;
          resumeGuestOnboardingTransfer(memberId)
            .then(completed => {
              if (isActive && completed && activeMemberIdRef.current === memberId) {
                setMemberDataRevision(revision => revision + 1);
              }
            })
            .catch(error => console.warn('군자역 게시물 재시도 실패', error));
        })
        .catch(() => undefined);
    });
    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [activeMemberIdRef, enabled]);

  /** 비회원이 로그인을 시작할 때 그때 보관함에 남은 장소를 기록합니다. */
  const beginTransfer = useCallback(
    (places: Place[]) => beginGuestOnboardingTransfer(toOnboardingKakaoPlaceIds(places)),
    [],
  );

  /** 로그인이 실패하거나 비회원이 둘러보기로 돌아가면 기록을 지웁니다. 실패는 무시합니다. */
  const cancelTransfer = useCallback(() => {
    cancelGuestOnboardingTransfer().catch(() => undefined);
  }, []);

  /** 로그아웃하면 다음 회원에게 실패 안내를 다시 띄울 수 있게 합니다. */
  const resetTransferError = useCallback(() => {
    transferErrorShownRef.current = false;
  }, []);

  return {memberDataRevision, resumeTransfer, beginTransfer, cancelTransfer, resetTransferError};
}
