import React, { useEffect, useRef, useState } from 'react';
import type {Session} from '@supabase/supabase-js';
import { Alert, AppState, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import { ensureLocationPermission } from './src/lib/location-permission';
import type {SavedPlaceViewContext} from './src/analytics/savedPlaceEvents';
import { configureDataSources } from './src/app/configureDataSources';
import { BottomNavigationBar } from './src/components/BottomNavigationBar';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { RequiredAppUpdateModal } from './src/components/RequiredAppUpdateModal';
import { getCurrentProfile } from './src/entities/info/api';
import type { ProfileApiError, ProfileInfo } from './src/entities/info/types';
import type {InboxReel} from './src/entities/content/inbox-api';
import type {HistoryReel} from './src/entities/content/types';
import type { Place } from './src/entities/place/types';
import {
  ONBOARDING_PLACES,
  ONBOARDING_PLACE_REELS,
} from './src/entities/onboarding/data';
import {
  beginGuestOnboardingTransfer,
  cancelGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
} from './src/entities/onboarding/transfer';
import type { NormalizedAuthError } from './src/lib/auth/errors';
import {
  isAppleSignInSupported,
  signInWithApple,
} from './src/lib/auth/signInWithApple';
import {
  deleteAccount,
  getLinkedDeletionProviders,
  type AccountDeletionProvider,
  type DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import { signInWithGoogle } from './src/lib/auth/signInWithGoogle';
import { signInWithKakao } from './src/lib/auth/signInWithKakao';
import { openKakaoChannelChat } from './src/lib/support/openKakaoChannelChat';
import { supabase } from './src/lib/auth/supabase';
import { flushShareAnalytics } from './src/lib/share-intent/posthog-share';
import { getAppUpdatePolicy } from './src/lib/app-update-policy';
import { ForegroundElapsedTimer } from './src/lib/foreground-elapsed-timer';
import {
  trackAppOpened,
  trackLoginFinished,
  trackLoginStarted,
  type LoginFailureType,
} from './src/analytics/userEntryEvents';
import type {InboxEntryType} from './src/analytics/placeSavingEvents';
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
import { InBoxScreen } from './src/pages/inBox/inBoxScreen';
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
  getShareSession,
  reconcileShareSession,
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
const EMPTY_GUEST_INBOX: InboxReel[] = [];
const EMPTY_GUEST_HISTORY: HistoryReel[] = [];
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
  const [hasVisitedMap, setHasVisitedMap] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceViewContext, setSelectedPlaceViewContext] =
    useState<SavedPlaceViewContext | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
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
  const [isInBoxSelecting, setIsInBoxSelecting] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  const [inBoxEntryType, setInBoxEntryType] = useState<InboxEntryType>('direct');
  const hasTrackedAppOpenedRef = useRef(false);

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
    requiredUpdateStoreUrl === null;

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

  const openMainScreen = (
    nextScreen: MainScreen,
    entryType: InboxEntryType = 'direct',
  ) => {
    if (
      nextScreen === 'history' &&
      flowState.kind === 'main' &&
      flowState.activeTab !== 'history'
    ) {
      historyReturnScreenRef.current = flowState.activeTab;
    }

    if (nextScreen === 'map') {
      setHasVisitedMap(true);
    }

    setFlowState({
      kind: 'main',
      activeTab: nextScreen,
      detailSource: null,
    });
    if (nextScreen === 'inBox') {
      setInBoxEntryType(entryType);
    }
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

    const resumeOnboardingTransfer = (session: Session) => {
      resumeGuestOnboardingTransfer(session)
        .then(completed => {
          if (
            !isMounted ||
            !completed ||
            activeUserIdRef.current !== session.user.id
          ) return;
          transferErrorShownRef.current = false;
          setMemberDataRevision(revision => revision + 1);
        })
        .catch(error => {
          console.warn('군자역 게시물 저장 실패', error);
          if (
            !isMounted ||
            activeUserIdRef.current !== session.user.id ||
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
      await reconcileShareSession().catch(() => undefined);
      const [{data, error}, signedInOnThisInstall] = await Promise.all([
        supabase.auth.getSession(),
        hasSignedInOnThisInstall(),
      ]);

      if (!isMounted) {
        return;
      }
      hasSignedInOnThisInstallRef.current = signedInOnThisInstall;

      if (error || !data.session) {
        activeUserIdRef.current = null;
        setIsAuthenticated(false);
        if (!hasTrackedAppOpenedRef.current) {
          trackAppOpened(posthog, false);
          hasTrackedAppOpenedRef.current = true;
        }

        if (!error) {
          const sharedSession = await getShareSession().catch(() => null);
          if (!sharedSession?.refreshToken) await syncShareSession(null);
        }

        setFlowState(
          signedInOnThisInstall ? INITIAL_FLOW_STATE : GUEST_MAIN_FLOW_STATE,
        );
        setMyPageOverlay(null);
        setIsAuthReady(true);
        return;
      }

      await syncShareSession(data.session);
      activeUserIdRef.current = data.session.user.id;
      setIsAuthenticated(true);
      resumeWaitingShares().catch(() => undefined);
      resumeOnboardingTransfer(data.session);

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
      const policy = await getAppUpdatePolicy();

      if (isMounted && policy?.updateRequired) {
        setRequiredUpdateStoreUrl(policy.storeUrl);
      }
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session || event === 'SIGNED_OUT') {
        syncShareSession(session)
          .then(() => {
            if (session) return resumeWaitingShares();
          })
          .catch(() => undefined);
      }
      if (!isMounted) {
        return;
      }

      // 첫 세션 판정은 syncFlowState에서 설치 내 로그인 기록과 함께 처리합니다.
      if (event === 'INITIAL_SESSION' && !session) {
        return;
      }

      if (!session) {
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
      activeUserIdRef.current = session.user.id;
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
      resumeOnboardingTransfer(session);
    });

    return () => {
      isMounted = false;
      if (splashTimer) {
        clearTimeout(splashTimer);
      }
      subscription.unsubscribe();
    };
  }, [posthog]);

  useEffect(() => {
    if (isAuthenticated !== true) return;

    let isActive = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      supabase.auth.getSession()
        .then(({data}) => {
          if (!data.session) return;
          resumeGuestOnboardingTransfer(data.session)
            .then(completed => {
              if (
                isActive &&
                completed &&
                activeUserIdRef.current === data.session?.user.id
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
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        return;
      }

      getAppUpdatePolicy().then(policy => {
        if (policy?.updateRequired) {
          setRequiredUpdateStoreUrl(policy.storeUrl);
        }
      });
    });

    return () => subscription.remove();
  }, []);

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
            openMainScreenRef.current('saved', 'auto');
            return;
          }
          if (result.transferStatus === 'LOGIN_HANDOFF') {
            supabase.auth.getSession().then(({data}) => {
              if (data.session) {
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
          openMainScreenRef.current(
            result.saveMode === 'AUTO_SAVE' ? 'saved' : 'inBox',
            'auto',
          );
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
          reconcileShareSession()
            .then(resumeWaitingShares)
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
      if (
        isAuthenticated === false &&
        hasCompletedGuide === true &&
        !hasSignedInOnThisInstallRef.current
      ) {
        await beginGuestOnboardingTransfer();
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
      const normalizedError = error as NormalizedAuthError;
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

    const { error } = await supabase.auth.signOut();

    if (!error) {
      return;
    }

    setIsLogoutPending(false);
    Alert.alert(
      '로그아웃 실패',
      '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.',
    );
  };

  const handleOpenAccountDeletion = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      Alert.alert(
        '로그인이 필요해요',
        '회원탈퇴를 진행하려면 다시 로그인해주세요.',
      );
      return;
    }

    setLinkedDeletionProviders(getLinkedDeletionProviders(user));
    setMyPageOverlay('accountDeletion');
  };

  const handleDeleteAccount = async (payload: DeleteAccountRequest) => {
    await deleteAccount(payload);

    setCurrentProfile(null);
    setProfileError(null);
    setMyPageOverlay(null);

    await supabase.auth.signOut({ scope: 'local' });
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
          guestReels={isAuthenticated === false ? EMPTY_GUEST_HISTORY : undefined}
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
      return (
        <SavedPlacesScreen
          key={
            isAuthenticated === false
              ? 'guest-saved'
              : `member-saved-${memberDataRevision}`
          }
          initialScrollOffset={savedPlacesScrollOffsetRef.current}
          isGuest={isAuthenticated === false}
          places={isAuthenticated === false ? ONBOARDING_PLACES : undefined}
          onAuthenticationRequired={handleRequireLogin}
          onEditModeChange={setIsSavedPlacesEditing}
          onOpenDetail={(place, context) =>
            openDetailFrom('saved', place, context)
          }
          onScrollOffsetChange={offset => {
            savedPlacesScrollOffsetRef.current = offset;
          }}
          onRequireLogin={handleRequireLogin}
          onOpenInbox={() => openMainScreen('inBox')}
          onSharedResultConsumed={clearShareResult}
        />
      );
    }

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

    if (currentScreen === 'map') {
      return null;
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
    !isSavedPlacesEditing &&
    !isInBoxSelecting;

  const isMapScreen = currentScreen === 'map';
  const shouldKeepMapMounted =
    flowState.kind === 'main' && (isMapScreen || hasVisitedMap);
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
          {shouldKeepMapMounted ? (
            <View
              pointerEvents={isMapScreen ? 'auto' : 'none'}
              style={[
                StyleSheet.absoluteFill,
                !isMapScreen && styles.hiddenMapLayer,
              ]}
            >
              <MapScreen
                key={
                  isAuthenticated === false
                    ? 'guest-map'
                    : `member-map-${memberDataRevision}`
                }
                isActive={isMapScreen}
                isGuest={isAuthenticated === false}
                guestPlaces={isAuthenticated === false ? ONBOARDING_PLACES : undefined}
                onAuthenticationRequired={handleRequireLogin}
              />
            </View>
          ) : null}
          {isMapScreen ? null : renderScreen()}
          {showTabBar && activeTab ? (
            <BottomNavigationBar
              active={activeTab}
              onNavigate={openMainScreen}
            />
          ) : null}
        </View>
      </SafeAreaView>
      <RequiredAppUpdateModal
        storeUrl={requiredUpdateStoreUrl ?? ''}
        visible={requiredUpdateStoreUrl !== null}
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
  hiddenMapLayer: {
    opacity: 0,
  },
});

export default Sentry.wrap(App);
