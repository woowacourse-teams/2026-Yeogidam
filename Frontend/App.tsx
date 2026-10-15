import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import { ensureLocationPermission } from './src/lib/location-permission';
import type {SavedPlaceViewContext} from './src/analytics/savedPlaceEvents';
import { configureDataSources } from './src/app/configureDataSources';
import { BottomNavigationBar } from './src/components/BottomNavigationBar';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { AppUpdateModal } from './src/components/AppUpdateModal';
import { getCurrentProfile } from './src/entities/info/api';
import type { ProfileApiError, ProfileInfo } from './src/entities/info/types';
import type {HistoryReel} from './src/entities/content/types';
import type { Place } from './src/entities/place/types';
import {
  ONBOARDING_HISTORY_DETAIL,
  ONBOARDING_HISTORY_REEL,
  ONBOARDING_PLACES,
  ONBOARDING_PLACE_REELS,
} from './src/entities/onboarding/data';
import {
  beginGuestOnboardingTransfer,
  cancelGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
  toOnboardingKakaoPlaceIds,
} from './src/entities/onboarding/transfer';
import {
  normalizeAuthError,
  type NormalizedAuthError,
} from './src/lib/auth/errors';
import {
  isAppleSignInSupported,
  signInWithApple,
} from './src/lib/auth/signInWithApple';
import {
  deleteAccount,
  getLinkedDeletionProviders,
  isServerSideDeletionFailure,
  type AccountDeletionProvider,
  type DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import { signInWithGoogle } from './src/lib/auth/signInWithGoogle';
import { signInWithKakao } from './src/lib/auth/signInWithKakao';
import { openKakaoChannelChat } from './src/lib/support/openKakaoChannelChat';
import {
  clearSpringSession,
  getSpringMemberId,
  LocalSessionCleanupError,
  getSpringTokens,
  logoutSpringSession,
  onSpringSessionChange,
} from './src/lib/auth/spring-session';
import { flushShareAnalytics } from './src/lib/share-intent/posthog-share';
import { getAppUpdatePolicy, type AppUpdatePolicy } from './src/lib/app-update-policy';
import {
  getDismissedRecommendedVersion,
  rememberDismissedRecommendedVersion,
} from './src/lib/app-update-policy-storage';
import { ForegroundElapsedTimer } from './src/lib/foreground-elapsed-timer';
import {
  trackAppOpened,
  trackLoginFinished,
  trackLoginStarted,
  type LoginFailureType,
} from './src/analytics/userEntryEvents';
// import type {InboxEntryType} from './src/analytics/placeSavingEvents';
import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
  rememberSignInOnThisInstall,
} from './src/lib/app-guide-storage';
import { AppGuideScreen } from './src/pages/guide/AppGuideScreen';
import { EmailLoginScreen } from './src/pages/login/EmailLoginScreen';
import { LoginScreen } from './src/pages/login/LoginScreen';
import { SignUpScreen } from './src/pages/login/SignUpScreen';
import { MapScreen } from './src/pages/map/MapScreen';
// 대기함(inBoxScreen, inbox-api)은 Supabase 전용이라 삭제했습니다. 다시 쓰려면 Spring API로 새로 만들어야 합니다.
import { HistoryScreen } from './src/pages/history/HistoryScreen';
import { AccountDeletionScreen } from './src/pages/my-page/AccountDeletionScreen';
import { MyPageScreen } from './src/pages/my-page/MyPageScreen';
import { TermsAgreementScreen } from './src/pages/my-page/TermsAgreementScreen';
import { PlaceDetailScreen } from './src/pages/place-detail/PlaceDetailScreen';
import { SavedPlacesScreen } from './src/pages/saved-places/SavedPlacesScreen';
import { SplashScreen } from './src/pages/splash/SplashScreen';
import {
  clearShareResult,
  getShareResults,
  resumeWaitingShares,
  syncShareAnalyticsConfiguration,
  syncShareSession,
} from './src/lib/share-intent';
import type {
  AppFlowState,
  AuthScreen,
  MainFlowState,
  MainScreen,
  Screen,
} from './src/types/navigation';
import {
  getSharedSaveState,
  setSharedSaveState,
} from './src/lib/reel-save-state';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://f6c4700ac928b9ecc34983fb58d0dcda@o4512179066896384.ingest.us.sentry.io/4512179119456256',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const INITIAL_FLOW_STATE: AppFlowState = {
  kind: 'auth',
  stack: ['login'],
};
const GUEST_MAIN_FLOW_STATE: MainFlowState = {
  kind: 'main',
  activeTab: 'saved',
  detailSource: null,
};
// const EMPTY_GUEST_INBOX: InboxReel[] = [];
const GUEST_HISTORY_REELS: HistoryReel[] = [ONBOARDING_HISTORY_REEL];
const GUEST_HISTORY_DETAILS = {
  [ONBOARDING_HISTORY_REEL.id]: ONBOARDING_HISTORY_DETAIL,
};
const SPLASH_MIN_DURATION_MS = 2000;
const GUEST_LOGIN_PROMPT_DELAY_MS = 3 * 60 * 1000;

type SocialProvider = 'apple' | 'kakao' | 'google';
type MyPageOverlay = 'terms' | 'accountDeletion' | 'guide' | null;

function toLoginFailureType(error: NormalizedAuthError): LoginFailureType {
  if (error.errorCode === 'AUTH000_001') {
    return 'user_cancelled';
  }

  if (
    error.errorCode === 'CLIENT000_001' ||
    error.errorCode === 'CLIENT000_002'
  ) {
    return 'network_error';
  }

  if (
    error.errorCode === 'AUTH400_001' ||
    error.errorCode === 'AUTH502_001'
  ) {
    return 'auth_failed';
  }

  return 'unknown';
}

configureDataSources();

function App() {
  const posthog = usePostHog();

  useEffect(() => {
    syncShareAnalyticsConfiguration().catch(() => undefined);
    flushShareAnalytics().catch(() => undefined);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        flushShareAnalytics().catch(() => undefined);
      }
    }, 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') flushShareAnalytics().catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  const [flowState, setFlowState] = useState<AppFlowState>(INITIAL_FLOW_STATE);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceViewContext, setSelectedPlaceViewContext] =
    useState<SavedPlaceViewContext | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [guestPlaces, setGuestPlaces] = useState<Place[]>(ONBOARDING_PLACES);
  const [memberDataRevision, setMemberDataRevision] = useState(0);
  const hasSignedInOnThisInstallRef = useRef(false);
  const transferErrorShownRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [hasCompletedGuide, setHasCompletedGuide] = useState<boolean | null>(
    null,
  );
  const [requiredUpdateStoreUrl, setRequiredUpdateStoreUrl] = useState<
    string | null
  >(null);
  const [recommendedUpdate, setRecommendedUpdate] = useState<{
    latestVersion: string;
    storeUrl: string;
  } | null>(null);
  const dismissedRecommendedVersionRef = useRef<string | null>(null);
  const dismissedRecommendedVersionLoadRef = useRef<Promise<string | null> | null>(
    null,
  );
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] =
    useState<SocialProvider | null>(null);
  const loginAttemptInFlightRef = useRef(false);
  const [hasPendingShareLogin, setHasPendingShareLogin] = useState(false);
  const [isGuestLoginPromptVisible, setIsGuestLoginPromptVisible] =
    useState(false);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === 'active',
  );
  const [guestLoginPromptTimer] = useState(
    () =>
      new ForegroundElapsedTimer(GUEST_LOGIN_PROMPT_DELAY_MS, () => {
        setIsGuestLoginPromptVisible(true);
      }),
  );
  const guestReturnFlowRef = useRef<MainFlowState | null>(null);
  const [socialLoginError, setSocialLoginError] =
    useState<NormalizedAuthError | null>(null);
  const lastHandledShareResultRef = useRef<string | null>(null);
  const lastLoggedShareResultsRef = useRef<string | null>(null);
  const savedPlacesScrollOffsetRef = useRef(0);
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(
    null,
  );
  const [profileError, setProfileError] = useState<ProfileApiError | null>(
    null,
  );
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  const historyReturnScreenRef = useRef<MainScreen>('saved');
  const [isSavedPlacesEditing, setIsSavedPlacesEditing] = useState(false);
  // const [isInBoxSelecting, setIsInBoxSelecting] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  // const [inBoxEntryType, setInBoxEntryType] = useState<InboxEntryType>('direct');
  const hasTrackedAppOpenedRef = useRef(false);

  const applyUpdatePolicy = useCallback((policy: AppUpdatePolicy | null) => {
    if (!policy) return;

    if (policy.updateRequired) {
      setRecommendedUpdate(null);
      setRequiredUpdateStoreUrl(policy.storeUrl);
      return;
    }

    if (
      policy.updateRecommended &&
      dismissedRecommendedVersionRef.current !== policy.latestVersion
    ) {
      setRecommendedUpdate({
        latestVersion: policy.latestVersion,
        storeUrl: policy.storeUrl,
      });
    } else {
      setRecommendedUpdate(null);
    }
  }, []);

  const getUpdatePolicyWithDismissalLoaded = useCallback(async () => {
    if (!dismissedRecommendedVersionLoadRef.current) {
      dismissedRecommendedVersionLoadRef.current =
        getDismissedRecommendedVersion();
    }

    const [policy, dismissedVersion] = await Promise.all([
      getAppUpdatePolicy(),
      dismissedRecommendedVersionLoadRef.current,
    ]);
    if (dismissedRecommendedVersionRef.current === null) {
      dismissedRecommendedVersionRef.current = dismissedVersion;
    }
    return policy;
  }, []);

  const currentScreen: Screen =
    flowState.kind === 'auth'
      ? flowState.stack[flowState.stack.length - 1]
      : flowState.detailSource
      ? 'detail'
      : flowState.activeTab;

  const isGuestBrowsing =
    isAuthReady &&
    !isSplashVisible &&
    hasCompletedGuide === true &&
    flowState.kind === 'main' &&
    isAuthenticated === false &&
    !hasPendingShareLogin &&
    myPageOverlay === null &&
    requiredUpdateStoreUrl === null &&
    recommendedUpdate === null;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setIsAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isGuestBrowsing && isAppActive) {
      guestLoginPromptTimer.start();
    } else {
      guestLoginPromptTimer.pause();
    }
  }, [guestLoginPromptTimer, isAppActive, isGuestBrowsing]);

  useEffect(() => {
    if (isAuthenticated) {
      guestLoginPromptTimer.cancel();
      setIsGuestLoginPromptVisible(false);
      guestReturnFlowRef.current = null;
    }
  }, [guestLoginPromptTimer, isAuthenticated]);

  useEffect(() => () => guestLoginPromptTimer.cancel(), [guestLoginPromptTimer]);

  // 비회원이 지운 시드 장소는 메모리에만 두고, 다음 비회원 진입 때 시드로 되돌립니다.
  useEffect(() => {
    if (isAuthenticated !== false) {
      setGuestPlaces(ONBOARDING_PLACES);
    }
  }, [isAuthenticated]);

  const deleteGuestPlaces = useCallback((placeIds: string[]) => {
    const deletedIds = new Set(placeIds);
    setGuestPlaces(current => current.filter(place => !deletedIds.has(place.id)));
  }, []);

  useEffect(() => {
    if (isAuthenticated === true && hasCompletedGuide === true) {
      hasSignedInOnThisInstallRef.current = true;
      rememberSignInOnThisInstall().catch(() => undefined);
    }
  }, [hasCompletedGuide, isAuthenticated]);

  const canRequestLocation =
    isAuthReady &&
    !isSplashVisible &&
    hasCompletedGuide === true &&
    flowState.kind === 'main' &&
    !requiredUpdateStoreUrl;
  useEffect(() => {
    if (!canRequestLocation) return;
    const request = () => {
      if (AppState.currentState === 'active')
        ensureLocationPermission(true).catch(error =>
          console.warn('위치 권한 확인 실패', error),
        );
    };
    const frame = requestAnimationFrame(request);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') request();
    });
    return () => {
      cancelAnimationFrame(frame);
      subscription.remove();
    };
  }, [canRequestLocation]);

  const pushAuthScreen = (nextScreen: Exclude<AuthScreen, 'login'>) => {
    setFlowState(current =>
      current.kind === 'auth'
        ? {
            ...current,
            stack: [...current.stack, nextScreen],
          }
        : current,
    );
  };

  const popAuthScreen = () => {
    setFlowState(current => {
      if (current.kind !== 'auth' || current.stack.length === 1) {
        return current;
      }

      return {
        ...current,
        stack: current.stack.slice(0, -1),
      };
    });
  };

  const openMainScreen = (nextScreen: MainScreen) => {
    // 대기함 복원 시 entryType: InboxEntryType = 'direct' 인자를 다시 받습니다.
    if (
      nextScreen === 'history' &&
      flowState.kind === 'main' &&
      flowState.activeTab !== 'history'
    ) {
      historyReturnScreenRef.current = flowState.activeTab;
    }

    setFlowState({
      kind: 'main',
      activeTab: nextScreen,
      detailSource: null,
    });
    // if (nextScreen === 'inBox') setInBoxEntryType(entryType);
  };

  const openMainScreenRef = useRef(openMainScreen);
  openMainScreenRef.current = openMainScreen;

  const openDetailFrom = (
    sourceScreen: 'saved' | 'map',
    place: Place,
    context?: SavedPlaceViewContext,
  ) => {
    setSelectedPlace(place);
    setSelectedPlaceViewContext(context ?? null);
    setFlowState(current =>
      current.kind === 'main'
        ? {
            ...current,
            activeTab: sourceScreen,
            detailSource: sourceScreen,
          }
        : current,
    );
  };

  const closeDetail = () => {
    setSelectedPlace(null);
    setSelectedPlaceViewContext(null);
    setFlowState(current =>
      current.kind === 'main'
        ? {
            ...current,
            detailSource: null,
          }
        : current,
    );
  };

  useEffect(() => {
    let isMounted = true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const resumeOnboardingTransfer = (memberId: string, isNewMember?: boolean) => {
      resumeGuestOnboardingTransfer(memberId, isNewMember)
        .then(completed => {
          if (
            !isMounted ||
            !completed ||
            activeUserIdRef.current !== memberId
          ) return;
          transferErrorShownRef.current = false;
          setMemberDataRevision(revision => revision + 1);
        })
        .catch(error => {
          console.warn('군자역 게시물 저장 실패', error);
          if (
            !isMounted ||
            activeUserIdRef.current !== memberId ||
            transferErrorShownRef.current
          ) return;
          transferErrorShownRef.current = true;
          Alert.alert(
            '군자역 게시물을 저장하지 못했어요',
            '연결을 확인해 주세요. 앱을 다시 열면 저장을 재시도할게요.',
          );
        });
    };

    const syncFlowState = async () => {
      const [tokens, memberId, signedInOnThisInstall] = await Promise.all([
        getSpringTokens().catch(() => null),
        getSpringMemberId().catch(() => null),
        hasSignedInOnThisInstall(),
      ]);

      if (!isMounted) {
        return;
      }
      hasSignedInOnThisInstallRef.current = signedInOnThisInstall;

      if (!tokens) {
        activeUserIdRef.current = null;
        setIsAuthenticated(false);
        if (!hasTrackedAppOpenedRef.current) {
          trackAppOpened(posthog, false);
          hasTrackedAppOpenedRef.current = true;
        }

        // Spring 세션이 없으면 Supabase 시절이나 다른 회원의 공유 세션이 남지 않게 지웁니다.
        await syncShareSession(null).catch(() => undefined);

        setFlowState(
          signedInOnThisInstall ? INITIAL_FLOW_STATE : GUEST_MAIN_FLOW_STATE,
        );
        setMyPageOverlay(null);
        setIsAuthReady(true);
        return;
      }

      activeUserIdRef.current = memberId;
      setIsAuthenticated(true);
      resumeWaitingShares().catch(() => undefined);
      if (memberId) resumeOnboardingTransfer(memberId);

      if (!hasTrackedAppOpenedRef.current) {
        trackAppOpened(posthog, true);
        hasTrackedAppOpenedRef.current = true;
      }

      setFlowState({
        kind: 'main',
        activeTab: 'saved',
        detailSource: null,
      });
      setIsAuthReady(true);
    };

    const checkUpdatePolicy = async () => {
      const policy = await getUpdatePolicyWithDismissalLoaded();

      if (isMounted) applyUpdatePolicy(policy);
    };

    const loadGuideCompletion = async () => {
      const [completed, signedInOnThisInstall] = await Promise.all([
        hasCompletedAppGuide(),
        hasSignedInOnThisInstall(),
      ]);

      if (isMounted) {
        hasSignedInOnThisInstallRef.current = signedInOnThisInstall;
        setHasCompletedGuide(completed || signedInOnThisInstall);
      }
    };

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([
      syncFlowState(),
      checkUpdatePolicy(),
      loadGuideCompletion(),
      splashDelay,
    ]).finally(() => {
      if (!isMounted) {
        return;
      }

      setIsSplashVisible(false);
    });

    const unsubscribe = onSpringSessionChange((event, memberId, details) => {
      if (event === 'SIGNED_IN') {
        resumeWaitingShares().catch(() => undefined);
      }
      // 토큰 회전은 화면 흐름을 바꾸지 않습니다. 공유 세션 동기화는 spring-session이 맡습니다.
      if (!isMounted || event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_OUT') {
        activeUserIdRef.current = null;
        transferErrorShownRef.current = false;
        setIsAuthenticated(false);
        setFlowState(
          hasSignedInOnThisInstallRef.current
            ? INITIAL_FLOW_STATE
            : GUEST_MAIN_FLOW_STATE,
        );
        setMyPageOverlay(null);
        setIsLogoutPending(false);
        setPendingSocialProvider(null);
        setIsAuthReady(true);
        return;
      }

      setSocialLoginError(null);
      activeUserIdRef.current = memberId;
      setIsAuthenticated(true);
      setSelectedPlace(null);
      setSelectedPlaceViewContext(null);
      savedPlacesScrollOffsetRef.current = 0;
      setHasPendingShareLogin(false);
      setIsLogoutPending(false);
      setPendingSocialProvider(null);
      setFlowState({
        kind: 'main',
        activeTab: 'saved',
        detailSource: null,
      });
      setIsAuthReady(true);
      if (memberId) resumeOnboardingTransfer(memberId, details?.isNewMember);
    });

    return () => {
      isMounted = false;
      if (splashTimer) {
        clearTimeout(splashTimer);
      }
      unsubscribe();
    };
  }, [posthog, applyUpdatePolicy, getUpdatePolicyWithDismissalLoaded]);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    let isActive = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      getSpringMemberId()
        .then(memberId => {
          if (!memberId) return;
          resumeGuestOnboardingTransfer(memberId)
            .then(completed => {
              if (
                isActive &&
                completed &&
                activeUserIdRef.current === memberId
              ) setMemberDataRevision(revision => revision + 1);
            })
            .catch(error => console.warn('군자역 게시물 재시도 실패', error));
        })
        .catch(() => undefined);
    });
    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    let isMounted = true;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        return;
      }

      getUpdatePolicyWithDismissalLoaded().then(policy => {
        if (isMounted) applyUpdatePolicy(policy);
      });
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [applyUpdatePolicy, getUpdatePolicyWithDismissalLoaded]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    let isMounted = true;

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
          const latestResult = results[results.length - 1];
          const result = latestResult?.transferStatus === 'GUEST_LOGIN_PROMPT'
            ? latestResult
            : activeRequestId
              ? results.find(item => item.requestId === activeRequestId) ?? latestResult
              : latestResult;
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
          const resultSnapshot = JSON.stringify({
            activeRequestId: activeRequestId ?? null,
            resultSummary,
          });
          if (__DEV__ && lastLoggedShareResultsRef.current !== resultSnapshot) {
            lastLoggedShareResultsRef.current = resultSnapshot;
            console.log(
              '[InstagramShare][native-results]',
              `activeRequestId=${activeRequestId ?? 'none'}`,
              ...resultSummary,
            );
          }
          if (!result) {
            lastHandledShareResultRef.current = null;
            if (currentShareState?.source === 'instagram_share') {
              setSharedSaveState(null);
            }
            return;
          }
          const resultKey = `${result.requestId ?? result.url}:${
            result.updatedAt
          }`;
          if (lastHandledShareResultRef.current === resultKey) return;
          lastHandledShareResultRef.current = resultKey;
          if (__DEV__) {
            console.log('[InstagramShare][native-result-selected]', {
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
          if (result.transferStatus === 'GUEST_LOGIN_PROMPT') {
            clearShareResult(result.requestId).catch(() => undefined);
            setSharedSaveState(null);
            setIsGuestLoginPromptVisible(false);
            setMyPageOverlay(null);
            guestReturnFlowRef.current = GUEST_MAIN_FLOW_STATE;
            setFlowState(INITIAL_FLOW_STATE);
            return;
          }
          if (result.transferStatus === 'GUEST_PREVIEW' || result.transferStatus === 'LOGIN_REQUIRED') {
            clearShareResult(result.requestId).catch(() => undefined);
            setIsGuestLoginPromptVisible(false);
            setMyPageOverlay(null);
            openMainScreenRef.current('saved');
            return;
          }
          if (result.transferStatus === 'LOGIN_HANDOFF') {
            getSpringTokens().then(tokens => {
              if (tokens) {
                resumeWaitingShares().catch(() => undefined);
                return;
              }
              setFlowState(INITIAL_FLOW_STATE);
            }).catch(() => undefined);
            return;
          }
          if (
            (result.transferStatus === 'API_FAILED' || result.transferStatus === 'API_SUCCEEDED') &&
            !result.reelId
          ) {
            clearShareResult(result.requestId).catch(() => undefined);
            // 공유 익스텐션은 401을 AUTH401_001로 남긴다(Android는 "AUTH401_001 | 메시지 | HTTP_401").
            // 추출 실패가 아니라 로그인 문제이므로 다시 로그인하거나 다시 공유하도록 안내한다.
            if (result.failureReason?.startsWith('AUTH401')) {
              getSpringTokens()
                .then(tokens => {
                  if (tokens) {
                    Alert.alert(
                      '공유한 게시물을 저장하지 못했어요',
                      '로그인 정보가 만료됐어요. 게시물을 다시 공유해 주세요.',
                    );
                    return;
                  }
                  setFlowState(INITIAL_FLOW_STATE);
                  Alert.alert(
                    '로그인이 필요해요',
                    '다시 로그인한 뒤 게시물을 공유해 주세요.',
                  );
                })
                .catch(() => undefined);
              return;
            }
            Alert.alert('장소 추출 실패', '공유한 콘텐츠의 장소를 추출하지 못했어요.');
            return;
          }
          if (result.transferStatus === 'SAVED' || result.transferStatus === 'WAITING_FOR_NETWORK' || result.transferStatus === 'WAITING_FOR_AUTH') {
            return;
          }
          setSharedSaveState({
            shareResultId: result.requestId,
            url: result.url,
            status: result.status,
            source: 'instagram_share',
            rawSharedText: result.rawSharedText,
            reused: result.reused,
            saveMode: result.saveMode,
            reel: {
              id: result.reelId ?? `share-${Date.now()}`,
              processing_status: result.status,
              failure_reason: result.failureReason ?? null,
              instagram_thumbnail_url: null,
              created_at: new Date(result.updatedAt).toISOString(),
            },
          });
          // v2 대기함 흐름 복원 시: openMainScreenRef.current(result.saveMode === 'AUTO_SAVE' ? 'saved' : 'inBox');
          openMainScreenRef.current('saved');
        })
        .catch(error => {
          if (__DEV__) {
            console.error('[InstagramShare][native-results-error]', error);
          }
        });
    };

    consumePendingSharedContent();

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextState => {
        if (nextState === 'active') {
          resumeWaitingShares()
            .then(consumePendingSharedContent)
            .catch(consumePendingSharedContent);
        }
      },
    );
    const resultPollId = setInterval(() => {
      if (AppState.currentState === 'active') consumePendingSharedContent();
    }, 1000);

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      clearInterval(resultPollId);
    };
  }, [isAuthReady]);

  useEffect(() => {
    if (flowState.kind !== 'main' || isAuthenticated !== true) {
      setCurrentProfile(null);
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    let isMounted = true;

    setIsProfileLoading(true);
    setProfileError(null);

    getCurrentProfile()
      .then(profile => {
        if (!isMounted) {
          return;
        }

        setCurrentProfile(profile);
      })
      .catch(error => {
        if (!isMounted) {
          return;
        }

        setCurrentProfile(null);
        setProfileError(error as ProfileApiError);
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }

        setIsProfileLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [flowState.kind, isAuthenticated]);

  const handleContinueWithSocial = async (provider: SocialProvider) => {
    if (pendingSocialProvider || loginAttemptInFlightRef.current) {
      return;
    }
    loginAttemptInFlightRef.current = true;
    let loginStarted = false;

    try {
      if (isAuthenticated === false && hasCompletedGuide === true) {
        await beginGuestOnboardingTransfer(toOnboardingKakaoPlaceIds(guestPlaces));
      }
      // 이전 회원의 공유 세션이 남아 있으면 익스텐션이 엉뚱한 계정으로 저장하지 않게 지웁니다.
      if (!(await getSpringTokens().catch(() => null))) {
        await syncShareSession(null).catch(() => undefined);
      }

      setSocialLoginError(null);
      setPendingSocialProvider(provider);
      trackLoginStarted(posthog, provider);
      loginStarted = true;
      if (provider === 'apple') {
        await signInWithApple();
        trackLoginFinished(posthog, {provider, outcome: 'success'});
        return;
      }

      if (provider === 'kakao') {
        await signInWithKakao();
        trackLoginFinished(posthog, {provider, outcome: 'success'});
        return;
      }

      await signInWithGoogle();
      trackLoginFinished(posthog, {provider, outcome: 'success'});
    } catch (error) {
      cancelGuestOnboardingTransfer().catch(() => undefined);
      if (!loginStarted) {
        Alert.alert('로그인을 시작하지 못했어요', '잠시 후 다시 시도해 주세요.');
        return;
      }
      const normalizedError = normalizeAuthError(error);
      trackLoginFinished(posthog, {
        provider,
        outcome: 'failure',
        failureType: toLoginFailureType(normalizedError),
      });
      setSocialLoginError(normalizedError);
      setPendingSocialProvider(null);
    } finally {
      loginAttemptInFlightRef.current = false;
    }
  };

  const handleCancelShareLogin = async () => {
    const results = await getShareResults();
    await Promise.all(results
      .filter(result => result.transferStatus === 'LOGIN_HANDOFF')
      .map(result => clearShareResult(result.requestId)));
    setHasPendingShareLogin(false);
  };

  const handleCompleteGuide = () => {
    setHasCompletedGuide(true);
    completeAppGuide();
  };

  const handleOpenGuestLogin = () => {
    if (flowState.kind !== 'main' || isAuthenticated !== false) return;

    setIsGuestLoginPromptVisible(false);
    guestReturnFlowRef.current = flowState;
    setFlowState(INITIAL_FLOW_STATE);
  };

  const handleRequireLogin = () => {
    if (isAuthenticated === false) {
      handleOpenGuestLogin();
      return;
    }
    setFlowState(INITIAL_FLOW_STATE);
  };

  // 로그아웃 뒤 등 로그인 화면이 첫 화면일 때 비회원 둘러보기로 들어간다.
  const handleBrowseAsGuest = () => {
    setSocialLoginError(null);
    setFlowState(GUEST_MAIN_FLOW_STATE);
  };

  const handleContinueBrowsing = () => {
    const previousFlow = guestReturnFlowRef.current;
    if (!previousFlow) return;

    cancelGuestOnboardingTransfer().catch(() => undefined);
    guestReturnFlowRef.current = null;
    setFlowState(previousFlow);
  };

  const showPreparingAlert = (featureName: string) => {
    Alert.alert('준비 중', `${featureName} 기능은 아직 준비 중이에요.`);
  };

  const handleLogout = async () => {
    if (isLogoutPending) {
      return;
    }

    setIsLogoutPending(true);

    // 로컬 중심 로그아웃: 서버 세션 폐기는 best-effort이고, 로컬 정리가 끝나면 SIGNED_OUT으로
    // 로그인 화면에 간다. 로컬 정리에 실패하면 로그인 상태를 유지하고 다시 시도하게 한다.
    try {
      const result = await logoutSpringSession();
      if (!result.serverConfirmed) {
        // TODO(analytics): logout_server_unconfirmed 이벤트 기록 (result.serverError)
      }
      return;
    } catch (error) {
      if (error instanceof LocalSessionCleanupError) {
        // TODO(analytics): logout_local_cleanup_failed 이벤트 기록 (error.cause)
      }
    }

    setIsLogoutPending(false);
    Alert.alert(
      '로그아웃 실패',
      '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.',
    );
  };

  const handleOpenAccountDeletion = async () => {
    let oauthProvider: ProfileInfo['oauthProvider'];
    try {
      oauthProvider = (currentProfile ?? (await getCurrentProfile())).oauthProvider;
    } catch {
      oauthProvider = undefined;
    }
    const providers = getLinkedDeletionProviders(oauthProvider);

    if (providers.length === 0) {
      Alert.alert(
        '로그인이 필요해요',
        '회원탈퇴를 진행하려면 다시 로그인해주세요.',
      );
      return;
    }

    setLinkedDeletionProviders(providers);
    setMyPageOverlay('accountDeletion');
  };

  const handleDeleteAccount = async (payload: DeleteAccountRequest) => {
    try {
      await deleteAccount(payload);
    } catch (error) {
      // 재인증 문제처럼 사용자가 고칠 수 있는 실패는 탈퇴 화면에서 안내한다.
      if (!isServerSideDeletionFailure(error)) throw error;
      // 서버·네트워크 실패는 탈퇴된 것처럼 처리하고 운영팀이 서버에서 수동으로 탈퇴를 마무리한다.
      // TODO(sentry): 탈퇴 서버 실패 알림 (회원 ID: activeUserIdRef.current, 제공자: currentProfile?.oauthProvider, error)
    }

    // 서버 회원은 삭제됐거나 수동 삭제 대상이므로 로그아웃 API 없이 앱·공유 익스텐션 세션만 지운다.
    try {
      await clearSpringSession();
    } catch {
      // TODO(analytics): account_deletion_local_cleanup_failed 이벤트 기록
      Alert.alert(
        '회원탈퇴를 마무리하지 못했어요',
        '앱을 완전히 종료한 뒤 다시 실행해 주세요.',
      );
      return;
    }

    setCurrentProfile(null);
    setProfileError(null);
    setMyPageOverlay(null);
    activeUserIdRef.current = null;
    setIsAuthenticated(false);
    setFlowState(INITIAL_FLOW_STATE);
    Alert.alert('회원탈퇴 완료', '회원탈퇴가 완료되었어요.');
  };

  const handleRetryProfile = async () => {
    setIsProfileLoading(true);

    try {
      const profile = await getCurrentProfile();

      setCurrentProfile(profile);
    } catch (error) {
      setCurrentProfile(null);
      setProfileError(error as ProfileApiError);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const renderScreen = () => {
    if (currentScreen === 'history') {
      return (
        <HistoryScreen
          guestReels={isAuthenticated === false ? GUEST_HISTORY_REELS : undefined}
          guestDetails={isAuthenticated === false ? GUEST_HISTORY_DETAILS : undefined}
          onBack={() => openMainScreen(historyReturnScreenRef.current)}
          onRequireLogin={handleRequireLogin}
        />
      );
    }

    if (myPageOverlay === 'terms') {
      return <TermsAgreementScreen onBack={() => setMyPageOverlay(null)} />;
    }

    if (myPageOverlay === 'accountDeletion') {
      return (
        <AccountDeletionScreen
          linkedProviders={linkedDeletionProviders}
          onBack={() => setMyPageOverlay(null)}
          onDeleteAccount={handleDeleteAccount}
        />
      );
    }

    if (myPageOverlay === 'guide') {
      return (
        <AppGuideScreen onComplete={() => setMyPageOverlay(null)} />
      );
    }

    if (currentScreen === 'login') {
      return (
        <LoginScreen
          isAppleLoginAvailable={isAppleSignInSupported}
          pendingSocialProvider={pendingSocialProvider}
          socialLoginError={socialLoginError}
          onContinueWithApple={() => handleContinueWithSocial('apple')}
          onContinueWithGoogle={() => handleContinueWithSocial('google')}
          onContinueWithKakao={() => handleContinueWithSocial('kakao')}
          onOpenContact={openKakaoChannelChat}
          onOpenTerms={() => pushAuthScreen('terms')}
          onCancelShareLogin={hasPendingShareLogin ? handleCancelShareLogin : undefined}
          onContinueBrowsing={guestReturnFlowRef.current ? handleContinueBrowsing : undefined}
          onBrowseAsGuest={
            isAuthenticated === false &&
            !guestReturnFlowRef.current &&
            !hasPendingShareLogin
              ? handleBrowseAsGuest
              : undefined
          }
        />
      );
    }

    if (currentScreen === 'emailLogin') {
      return (
        <EmailLoginScreen
          onBack={popAuthScreen}
          onLogin={() => showPreparingAlert('이메일 로그인')}
          onOpenSignup={() => pushAuthScreen('signup')}
          onOpenTerms={() => pushAuthScreen('terms')}
        />
      );
    }

    if (currentScreen === 'signup') {
      return (
        <SignUpScreen
          onBack={popAuthScreen}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onOpenTerms={() => pushAuthScreen('terms')}
          onSignUp={() => showPreparingAlert('이메일 회원가입')}
        />
      );
    }

    if (currentScreen === 'terms') {
      return <TermsAgreementScreen onBack={popAuthScreen} />;
    }

    if (currentScreen === 'saved') {
      // 대기함 복원 시 onOpenInbox={() => openMainScreen('inBox')} 연결을 되살립니다.
      return (
        <SavedPlacesScreen
          key={
            isAuthenticated === false
              ? 'guest-saved'
              : `member-saved-${memberDataRevision}`
          }
          initialScrollOffset={savedPlacesScrollOffsetRef.current}
          isGuest={isAuthenticated === false}
          places={isAuthenticated === false ? guestPlaces : undefined}
          onDeleteGuestPlaces={
            isAuthenticated === false ? deleteGuestPlaces : undefined
          }
          onAuthenticationRequired={handleRequireLogin}
          onEditModeChange={setIsSavedPlacesEditing}
          onOpenDetail={(place, context) =>
            openDetailFrom('saved', place, context)
          }
          onScrollOffsetChange={offset => {
            savedPlacesScrollOffsetRef.current = offset;
          }}
          onRequireLogin={handleRequireLogin}
          onSharedResultConsumed={clearShareResult}
        />
      );
    }

    // 대기함 흐름을 다시 사용할 때 복원합니다.
    /*
    if (currentScreen === 'inBox') {
      return (
        <InBoxScreen
          entryType={inBoxEntryType}
          guestItems={isAuthenticated === false ? EMPTY_GUEST_INBOX : undefined}
          onOpenHistory={() => openMainScreen('history')}
          onRequireLogin={handleRequireLogin}
          onSelectionChange={setIsInBoxSelecting}
        />
      );
    }

    */

    if (currentScreen === 'map') {
      return (
        <MapScreen
          key={
            isAuthenticated === false
              ? 'guest-map'
              : `member-map-${memberDataRevision}`
          }
          isGuest={isAuthenticated === false}
          guestPlaces={isAuthenticated === false ? guestPlaces : undefined}
          onDeleteGuestPlaces={
            isAuthenticated === false ? deleteGuestPlaces : undefined
          }
          onAuthenticationRequired={handleRequireLogin}
        />
      );
    }

    if (currentScreen === 'detail' && selectedPlace) {
      return (
        <PlaceDetailScreen
          onBack={closeDetail}
          onAuthenticationRequired={handleRequireLogin}
          place={selectedPlace}
          guestReels={
            isAuthenticated === false
              ? ONBOARDING_PLACE_REELS[selectedPlace.id] ?? []
              : undefined
          }
          onDeleteGuestPlaces={
            isAuthenticated === false ? deleteGuestPlaces : undefined
          }
          viewContext={selectedPlaceViewContext ?? undefined}
        />
      );
    }

    return (
      <MyPageScreen
        currentProfile={currentProfile}
        isGuest={isAuthenticated === false}
        isProfileLoading={isProfileLoading}
        isLogoutPending={isLogoutPending}
        onOpenContact={openKakaoChannelChat}
        onOpenGuide={() => setMyPageOverlay('guide')}
        onLogout={handleLogout}
        onLogin={handleOpenGuestLogin}
        onOpenTerms={() => setMyPageOverlay('terms')}
        onRetryProfile={handleRetryProfile}
        onWithdraw={handleOpenAccountDeletion}
        profileError={profileError}
      />
    );
  };

  const showTabBar =
    flowState.kind === 'main' &&
    flowState.detailSource === null &&
    myPageOverlay === null &&
    !isSavedPlacesEditing;

  const isMapScreen = currentScreen === 'map';
  const activeTab = flowState.kind === 'main' ? flowState.activeTab : undefined;

  if (!isAuthReady || isSplashVisible || hasCompletedGuide === null) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#DBE0F9" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (!hasCompletedGuide) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <SafeAreaView
          edges={['top', 'left', 'right', 'bottom']}
          style={styles.safeArea}
        >
          <AppGuideScreen onComplete={handleCompleteGuide} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={isMapScreen ? ['left', 'right'] : ['top', 'left', 'right']}
        style={styles.safeArea}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor={isMapScreen ? 'transparent' : '#ffffff'}
          translucent={isMapScreen}
        />
        <View style={styles.container}>
          {renderScreen()}
          {showTabBar && activeTab ? (
            <BottomNavigationBar
              active={activeTab}
              isGuest={isAuthenticated === false}
              onNavigate={openMainScreen}
            />
          ) : null}
        </View>
      </SafeAreaView>
      <AppUpdateModal
        mode="required"
        storeUrl={requiredUpdateStoreUrl ?? ''}
        visible={requiredUpdateStoreUrl !== null}
      />
      <AppUpdateModal
        mode="recommended"
        storeUrl={recommendedUpdate?.storeUrl ?? ''}
        visible={recommendedUpdate !== null && requiredUpdateStoreUrl === null}
        onDismiss={() => {
          if (recommendedUpdate) {
            dismissedRecommendedVersionRef.current = recommendedUpdate.latestVersion;
            rememberDismissedRecommendedVersion(
              recommendedUpdate.latestVersion,
            ).catch(() => undefined);
          }
          setRecommendedUpdate(null);
        }}
      />
      <GuestLoginPrompt
        visible={isGuestLoginPromptVisible && isGuestBrowsing && isAppActive}
        onLogin={handleOpenGuestLogin}
        onContinueBrowsing={() => setIsGuestLoginPromptVisible(false)}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});

export default Sentry.wrap(App);
