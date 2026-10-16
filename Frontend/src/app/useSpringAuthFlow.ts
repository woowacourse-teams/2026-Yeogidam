import {useCallback, useEffect, useRef, useState} from 'react';

import type {AnalyticsClient} from '../analytics/analytics';
import {
  toLoginFailureType,
  trackAppOpened,
  trackLoginFinished,
  trackLoginStarted,
} from '../analytics/userEntryEvents';
import {getCurrentProfile} from '../entities/info/api';
import type {ProfileInfo} from '../entities/info/types';
import type {Place} from '../entities/place/types';
import {hasSignedInOnThisInstall, rememberSignInOnThisInstall} from '../lib/app-guide-storage';
import {
  deleteAccount,
  getLinkedDeletionProviders,
  isServerSideDeletionFailure,
  type AccountDeletionProvider,
  type DeleteAccountRequest,
} from '../lib/auth/deleteAccount';
import {withAuthErrorStage, type NormalizedAuthError} from '../lib/auth/errors';
import {signInWithApple} from '../lib/auth/signInWithApple';
import {signInWithGoogle} from '../lib/auth/signInWithGoogle';
import {signInWithKakao} from '../lib/auth/signInWithKakao';
import type {SocialProvider} from '../lib/auth/social-provider';
import {
  clearSpringSession,
  getSpringMemberId,
  getSpringTokens,
  LocalSessionCleanupError,
  logoutSpringSession,
  onSpringSessionChange,
} from '../lib/auth/spring-session';
import {captureSocialLoginError} from '../lib/monitoring/login-errors';
import {resumeWaitingShares, syncShareSession} from '../lib/share-intent';
import {useGuestOnboardingTransfer} from './useGuestOnboardingTransfer';

/** 저장된 세션을 확인하기 전이면 loading, 세션이 없으면 guest, 있으면 member입니다. */
export type AuthStatus = 'loading' | 'guest' | 'member';

export type SpringAuthFlowHandlers = {
  /** 세션이 없다고 확인됐거나 로그아웃됐을 때 부릅니다. 이 설치에서 로그인한 적이 있으면 로그인 화면으로 보내는 식으로 화면이 정합니다. */
  onGuestSession: (signedInOnThisInstall: boolean) => void;
  /** 저장된 세션을 복원했거나(restored) 방금 로그인했을 때(signed-in) 부릅니다. */
  onMemberSession: (source: 'restored' | 'signed-in') => void;
  /** 비회원 체험 장소 옮기기가 실패해 안내가 필요할 때 부릅니다. 한 세션에 한 번만 불립니다. */
  onGuestTransferFailed: () => void;
};

/**
 * 소셜 로그인 시도의 결과입니다. setup-failed는 제공자 인증을 시작하기 전에 실패한 것이라 화면이 안내하고,
 * provider-failed는 인증 뒤 실패라 socialLoginError에 남습니다. skipped는 이미 진행 중이라 무시한 것입니다.
 */
export type SocialLoginOutcome = 'success' | 'setup-failed' | 'provider-failed' | 'skipped';

/** 로그아웃 결과입니다. signed-out이면 SIGNED_OUT 이벤트가 화면을 옮기고, failed면 로그인 상태가 남습니다. */
export type LogoutOutcome = 'signed-out' | 'failed' | 'skipped';

export type AccountDeletionOutcome = 'completed' | 'cleanup-failed';

const SIGN_IN_BY_PROVIDER = {
  apple: signInWithApple,
  kakao: signInWithKakao,
  google: signInWithGoogle,
} as const;

/**
 * Spring 세션의 수명(부트 때 복원, 로그인, 로그아웃, 탈퇴, 세션 이벤트 구독)을 맡습니다.
 * 화면 이동은 handlers로 넘기므로 이 훅은 내비게이션 상태를 모릅니다.
 * 비회원 체험 장소 전환은 로그인한 회원 ID를 알아야 해서 이 안에서 함께 돌립니다.
 */
type Options = {
  posthog: AnalyticsClient | null | undefined;
  /** 앱 안내를 마쳤는지입니다. 안내를 마친 회원이 확인될 때만 이 설치에서 로그인했다고 기록합니다. */
  hasCompletedGuide: boolean | null;
};

export function useSpringAuthFlow(
  {posthog, hasCompletedGuide}: Options,
  handlers: SpringAuthFlowHandlers,
) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] = useState<SocialProvider | null>(null);
  const [socialLoginError, setSocialLoginError] = useState<NormalizedAuthError | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const activeMemberIdRef = useRef<string | null>(null);
  const hasSignedInOnThisInstallRef = useRef(false);
  const loginAttemptInFlightRef = useRef(false);
  const hasTrackedAppOpenedRef = useRef(false);

  const {memberDataRevision, resumeTransfer, beginTransfer, cancelTransfer, resetTransferError} =
    useGuestOnboardingTransfer({
      enabled: authStatus === 'member',
      activeMemberIdRef,
      posthog,
      onTransferFailed: handlers.onGuestTransferFailed,
    });

  useEffect(() => {
    let isMounted = true;

    const trackAppOpenedOnce = (isMember: boolean) => {
      if (hasTrackedAppOpenedRef.current) return;
      trackAppOpened(posthog, isMember);
      hasTrackedAppOpenedRef.current = true;
    };

    const syncSession = async () => {
      const [tokens, memberId, signedInOnThisInstall] = await Promise.all([
        getSpringTokens().catch(() => null),
        getSpringMemberId().catch(() => null),
        hasSignedInOnThisInstall(),
      ]);

      if (!isMounted) return;
      hasSignedInOnThisInstallRef.current = signedInOnThisInstall;

      if (!tokens) {
        activeMemberIdRef.current = null;
        trackAppOpenedOnce(false);
        // Spring 세션이 없으면 Supabase 시절이나 다른 회원의 공유 세션이 남지 않게 지웁니다.
        await syncShareSession(null).catch(() => undefined);
        setAuthStatus('guest');
        handlersRef.current.onGuestSession(signedInOnThisInstall);
        return;
      }

      activeMemberIdRef.current = memberId;
      resumeWaitingShares().catch(() => undefined);
      if (memberId) resumeTransfer(memberId);
      trackAppOpenedOnce(true);
      // 상태 변경과 화면 이동은 붙여 두어 둘 중 하나만 반영되는 틈을 만들지 않습니다.
      setAuthStatus('member');
      handlersRef.current.onMemberSession('restored');
    };

    syncSession().catch(() => undefined);

    const unsubscribe = onSpringSessionChange((event, memberId, details) => {
      if (event === 'SIGNED_IN') {
        resumeWaitingShares().catch(() => undefined);
      }
      // 토큰 회전은 화면 흐름을 바꾸지 않습니다. 공유 세션 동기화는 spring-session이 맡습니다.
      if (!isMounted || event === 'TOKEN_REFRESHED') return;

      if (event === 'SIGNED_OUT') {
        activeMemberIdRef.current = null;
        resetTransferError();
        setAuthStatus('guest');
        setIsLogoutPending(false);
        setPendingSocialProvider(null);
        handlersRef.current.onGuestSession(hasSignedInOnThisInstallRef.current);
        return;
      }

      setSocialLoginError(null);
      activeMemberIdRef.current = memberId;
      setAuthStatus('member');
      setIsLogoutPending(false);
      setPendingSocialProvider(null);
      handlersRef.current.onMemberSession('signed-in');
      if (memberId) resumeTransfer(memberId, details?.isNewMember);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [posthog, resetTransferError, resumeTransfer]);

  /**
   * 소셜 로그인을 시작합니다. guestTransferPlaces를 넘기면 비회원이 보관함에 남긴 그 장소를
   * 가입 뒤 옮길 대상으로 먼저 기록합니다. 시작 전에 실패하면 setup-failed를 돌려주어 화면이 안내하고,
   * 제공자 인증 뒤에 실패하면 로그인 화면이 보여 줄 오류로 남깁니다.
   */
  const continueWithSocial = async (
    provider: SocialProvider,
    guestTransferPlaces: Place[] | null,
  ): Promise<SocialLoginOutcome> => {
    if (pendingSocialProvider || loginAttemptInFlightRef.current) return 'skipped';
    loginAttemptInFlightRef.current = true;
    const hasGuestTransfer = guestTransferPlaces !== null;
    const signIn = SIGN_IN_BY_PROVIDER[provider];
    let signInStarted = false;

    // 로그인 버튼을 누른 시점에 기록해, 시작 전에 실패해도 로그인 시도로 센다.
    trackLoginStarted(posthog, provider);

    try {
      // 빈 배열도 전환 대상입니다. 비회원이 체험 장소를 모두 지웠어도 기록은 남깁니다.
      if (hasGuestTransfer) {
        await beginTransfer(guestTransferPlaces);
      }
      // 이전 회원의 공유 세션이 남아 있으면 익스텐션이 엉뚱한 계정으로 저장하지 않게 지웁니다.
      if (!(await getSpringTokens().catch(() => null))) {
        await syncShareSession(null).catch(() => undefined);
      }

      setSocialLoginError(null);
      setPendingSocialProvider(provider);
      signInStarted = true;
      await signIn();
      trackLoginFinished(posthog, {provider, outcome: 'success', hasGuestTransfer});
      return 'success';
    } catch (error) {
      cancelTransfer();
      const normalizedError = withAuthErrorStage(
        error,
        signInStarted ? 'provider_authorization' : 'login_setup',
      );
      captureSocialLoginError(provider, normalizedError);
      trackLoginFinished(posthog, {
        provider,
        outcome: 'failure',
        failureType: toLoginFailureType(normalizedError),
        hasGuestTransfer,
      });
      if (!signInStarted) return 'setup-failed';
      setSocialLoginError(normalizedError);
      setPendingSocialProvider(null);
      return 'provider-failed';
    } finally {
      loginAttemptInFlightRef.current = false;
    }
  };

  const clearSocialLoginError = useCallback(() => setSocialLoginError(null), []);

  // 로컬 중심 로그아웃: 서버 세션 폐기는 best-effort이고, 로컬 정리가 끝나면 SIGNED_OUT 이벤트가
  // 화면을 옮긴다. 로컬 정리에 실패하면 failed를 돌려주고 로그인 상태를 유지해 화면이 다시 시도하게 안내한다.
  const logout = async (): Promise<LogoutOutcome> => {
    if (isLogoutPending) return 'skipped';

    setIsLogoutPending(true);

    try {
      const result = await logoutSpringSession();
      if (!result.serverConfirmed) {
        // TODO(analytics): logout_server_unconfirmed 이벤트 기록 (result.serverError)
      }
      return 'signed-out';
    } catch (error) {
      if (error instanceof LocalSessionCleanupError) {
        // TODO(analytics): logout_local_cleanup_failed 이벤트 기록 (error.cause)
      }
    }

    setIsLogoutPending(false);
    return 'failed';
  };

  /** 탈퇴 화면에 보여 줄 재인증 제공자를 고릅니다. 프로필을 아직 못 읽었으면 한 번 더 읽어 봅니다. */
  const resolveDeletionProviders = async (
    currentProfile: ProfileInfo | null,
  ): Promise<AccountDeletionProvider[]> => {
    let oauthProvider: ProfileInfo['oauthProvider'];
    try {
      oauthProvider = (currentProfile ?? (await getCurrentProfile())).oauthProvider;
    } catch {
      oauthProvider = undefined;
    }
    return getLinkedDeletionProviders(oauthProvider);
  };

  /**
   * 서버 회원을 지우고 앱과 공유 익스텐션의 세션을 비웁니다.
   * 재인증 문제처럼 사용자가 고칠 수 있는 실패는 그대로 던져 탈퇴 화면이 안내하게 합니다.
   * cleanup-failed를 돌려주면 로그인 상태가 남아 있으므로 앱을 다시 실행하라고 안내해야 합니다.
   */
  const deleteAccountAndSignOut = async (
    payload: DeleteAccountRequest,
  ): Promise<AccountDeletionOutcome> => {
    try {
      await deleteAccount(payload);
    } catch (error) {
      if (!isServerSideDeletionFailure(error)) throw error;
      // 서버와 네트워크 실패는 탈퇴된 것처럼 처리하고 운영팀이 서버에서 수동으로 탈퇴를 마무리한다.
      // TODO(sentry): 탈퇴 서버 실패 알림 (회원 ID: activeMemberIdRef.current, 제공자: currentProfile?.oauthProvider, error)
    }

    // 서버 회원은 삭제됐거나 수동 삭제 대상이므로 로그아웃 API 없이 앱과 공유 익스텐션 세션만 지운다.
    try {
      await clearSpringSession();
    } catch {
      // TODO(analytics): account_deletion_local_cleanup_failed 이벤트 기록
      return 'cleanup-failed';
    }

    activeMemberIdRef.current = null;
    setAuthStatus('guest');
    return 'completed';
  };

  // 안내를 마친 회원이 확인되면 이 설치에서 로그인했다고 기록해, 다음 로그아웃 뒤에는 로그인 화면으로 보냅니다.
  useEffect(() => {
    if (authStatus === 'member' && hasCompletedGuide === true) {
      hasSignedInOnThisInstallRef.current = true;
      rememberSignInOnThisInstall().catch(() => undefined);
    }
  }, [authStatus, hasCompletedGuide]);

  return {
    authStatus,
    isLogoutPending,
    pendingSocialProvider,
    socialLoginError,
    memberDataRevision,
    cancelGuestTransfer: cancelTransfer,
    continueWithSocial,
    clearSocialLoginError,
    logout,
    resolveDeletionProviders,
    deleteAccountAndSignOut,
  };
}
