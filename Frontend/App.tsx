import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';
import Config from 'react-native-config';

import { ensureLocationPermission } from './src/lib/location-permission';
import {setAnalyticsGuestMode} from './src/analytics/analytics';
import type {SavedPlaceViewContext} from './src/analytics/savedPlaceEvents';
import { configureDataSources } from './src/app/configureDataSources';
import {
  BottomNavigationBar,
  SystemNavigationGradient,
} from './src/components/BottomNavigationBar';
import {SwipeBackStack, type BackScreen, type BackGestureRegion} from './src/components/navigation/SwipeBackStack';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { AppUpdateModal } from './src/components/AppUpdateModal';
import { getCurrentProfile } from './src/entities/info/api';
import type { ProfileApiError, ProfileInfo } from './src/entities/info/types';
import type { Place } from './src/entities/place/types';
import {
  withAuthErrorStage,
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
import {
  toLoginFailureType,
  trackAppOpened,
  trackLoginFinished,
  trackLoginStarted,
} from './src/analytics/userEntryEvents';
// import type {InboxEntryType} from './src/analytics/placeSavingEvents';
import {
  rememberSignInOnThisInstall,
} from './src/lib/app-guide-storage';
import { AppGuideScreen } from './src/pages/guide/AppGuideScreen';
import { EmailLoginScreen } from './src/pages/login/EmailLoginScreen';
import { LoginScreen } from './src/pages/login/LoginScreen';
import { OnboardingScreen } from './src/pages/onboarding/OnboardingScreen';
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
  environment: Config.APP_ENV?.trim() || 'development',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: false,

  // Enable Logs
  enableLogs: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function captureShareLoginHandoffError(errorCode: string) {
  const messages: Record<string, {title: string; description: string}> = {
    SHARE_LOGIN_STATE_READ_FAILED: {
      title: '장소 공유 오류 · 로그인 상태 확인',
      description: '공유 후 앱으로 돌아온 뒤 로그인 상태를 확인하지 못했습니다.',
    },
  };
  const event = messages[errorCode];
  if (!event) return;

  const rawEnvironment = Config.APP_ENV?.trim() || 'development';
  const environment = rawEnvironment.toLowerCase() === 'development'
    ? '개발'
    : rawEnvironment.toLowerCase() === 'production'
      ? '운영'
      : rawEnvironment;
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const message = `${event.description}\n` +
    `환경·기기: ${environment} · ${platform}\n` +
    `원인: 저장된 로그인 세션 조회 실패 (${errorCode})`;

  const error = new Error(message);
  error.name = event.title;

  Sentry.withScope(scope => {
    scope.setLevel('error');
    scope.setTag('feature', 'instagram_share');
    scope.setTag('share.stage', 'login_handoff');
    scope.setTag('share.source', 'instagram');
    scope.setTag('share.platform', Platform.OS);
    scope.setTag('share.error_code', errorCode);
    scope.setFingerprint(['instagram-share', 'login_handoff', Platform.OS, errorCode]);
    Sentry.captureException(error);
  });
}

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
const SPLASH_MIN_DURATION_MS = 2000;

type SocialProvider = 'apple' | 'kakao' | 'google';
type MyPageOverlay = 'terms' | 'accountDeletion' | 'guide' | null;

const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  apple: '애플',
  kakao: '카카오',
  google: '구글',
};

const LOGIN_STAGE_LABELS: Record<string, string> = {
  login_setup: '로그인 시작 준비',
  authorization_url: '인증 URL 요청',
  provider_authorization: '외부 서비스 인증',
  callback: '로그인 콜백 처리',
  backend_exchange: '백엔드 토큰 교환',
  session_persist: '로그인 세션 저장',
  unknown: '로그인 처리',
};

function describeSocialLoginError(
  provider: SocialProvider,
  error: NormalizedAuthError,
): string {
  const providerLabel = SOCIAL_PROVIDER_LABELS[provider];
  const reason =
    error.errorCode === 'CLIENT000_001'
      ? '네트워크 연결 오류'
      : error.errorCode === 'CLIENT000_002'
        ? '요청 시간 초과'
        : error.errorCode === 'CLIENT000_003'
          ? '응답 처리 오류'
          : error.status != null && error.status >= 500
            ? '서버 오류'
            : error.errorCode === 'AUTH502_001'
              ? '로그인 제공자 연결 오류'
              : '로그인 처리 오류';
  const rawEnvironment = Config.APP_ENV?.trim() || 'development';
  const environment = rawEnvironment.toLowerCase() === 'development'
    ? '개발'
    : rawEnvironment.toLowerCase() === 'production'
      ? '운영'
      : rawEnvironment;
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const codes = [
    error.errorCode,
    error.backendErrorCode && error.backendErrorCode !== error.errorCode
      ? error.backendErrorCode
      : null,
    error.status == null ? null : `HTTP ${error.status}`,
  ].filter(Boolean).join(', ');

  return `${providerLabel} 로그인 중 오류가 발생했습니다.\n` +
    `환경·기기: ${environment} · ${platform}\n` +
    `원인: ${reason} (${codes})`;
}

function getSocialLoginErrorTitle(error: NormalizedAuthError): string {
  const stageLabel = LOGIN_STAGE_LABELS[error.stage ?? 'unknown'] ?? '로그인 처리';
  return `소셜 로그인 오류 · ${stageLabel}`;
}

function captureSocialLoginError(
  provider: SocialProvider,
  error: NormalizedAuthError,
) {
  if (error.errorCode === 'AUTH000_001') {
    // 브라우저 종료에는 실제 사용자 취소도 포함될 수 있어 진단용 경고로 기록합니다.
    const cancelOrigin = error.cancelOrigin;
    if (
      Platform.OS === 'android' &&
      (cancelOrigin === 'browser_cancel' || cancelOrigin === 'browser_dismiss')
    ) {
      Sentry.withScope(scope => {
        scope.setTag('feature', 'social_login');
        scope.setTag('login.provider', provider);
        scope.setTag('login.stage', error.stage ?? 'unknown');
        scope.setTag('login.error_code', error.errorCode);
        scope.setTag('login.cancel_origin', cancelOrigin);
        scope.setFingerprint([
          'social-login-browser-without-callback',
          provider,
          cancelOrigin,
        ]);
        Sentry.captureMessage('소셜 로그인 브라우저가 콜백 없이 종료됨', 'warning');
      });
    }
    return;
  }

  // 제공자의 인증 거절은 앱 오류 이벤트로 남기지 않습니다.
  const backendErrorCode = error.backendErrorCode;
  if (
    error.errorCode === 'AUTH400_001' ||
    backendErrorCode === 'AUTH401_002'
  ) {
    return;
  }

  const reportableCodes = [
    'CLIENT000_001',
    'CLIENT000_002',
    'CLIENT000_003',
    'AUTH502_001',
  ];
  if (
    !(error.status != null && error.status >= 500) &&
    !reportableCodes.includes(error.errorCode) &&
    !['AUTH502_001', 'AUTH502_002', 'AUTH503_001', 'AUTH503_002'].includes(
      backendErrorCode ?? '',
    )
  ) {
    return;
  }

  Sentry.withScope(scope => {
    scope.setTag('feature', 'social_login');
    scope.setTag('login.provider', provider);
    scope.setTag('login.stage', error.stage ?? 'unknown');
    scope.setTag('login.error_code', error.errorCode);
    if (backendErrorCode) {
      scope.setTag('login.backend_error_code', backendErrorCode);
    }
    if (error.status != null) {
      scope.setTag('http.status_code', String(error.status));
    }
    scope.setExtra('request_id', error.requestId);
    scope.setExtra('retryable', error.retryable);
    scope.setFingerprint([
      'social-login',
      provider,
      backendErrorCode ?? error.errorCode,
      String(error.status ?? 'no-status'),
    ]);

    const safeError = new Error(describeSocialLoginError(provider, error));
    safeError.name = getSocialLoginErrorTitle(error);
    Sentry.captureException(safeError);
  });
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
  const [showLoginCloseButton, setShowLoginCloseButton] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceViewContext, setSelectedPlaceViewContext] =
    useState<SavedPlaceViewContext | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    setAnalyticsGuestMode(isAuthenticated === null ? null : !isAuthenticated);
  }, [isAuthenticated]);
  const activeUserIdRef = useRef<string | null>(null);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  // 로그아웃 상태로 앱을 열면 이번 실행 동안 로그인 화면 앞에 온보딩을 보여준다.
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(false);
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
  const guestReturnFlowRef = useRef<MainFlowState | null>(null);
  const [socialLoginError, setSocialLoginError] =
    useState<NormalizedAuthError | null>(null);
  // 이미 처리한 공유 결과 키. 서로 다른 결과가 번갈아 선택돼 화면이 오가지 않게 전부 기억한다.
  const handledShareResultKeysRef = useRef<Set<string>>(new Set());
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
  const mainTabHistoryRef = useRef<MainScreen[]>([]);
  const nestedBackStateRef = useRef(false);
  const [mapBackGestureRegion, setMapBackGestureRegion] = useState<BackGestureRegion>({top: Number.MAX_SAFE_INTEGER, bottom: 0});
  const reportMapBackGestureRegion = useCallback((region: BackGestureRegion) => {
    setMapBackGestureRegion(current => current.top === region.top && current.bottom === region.bottom ? current : region);
  }, []);
  const [nestedBackStates, setNestedBackStates] = useState({
    map: false,
    history: false,
    saved: false,
  });
  const reportMapBackState = useCallback((canGoBack: boolean) => {
    setNestedBackStates(current =>
      current.map === canGoBack ? current : {...current, map: canGoBack},
    );
  }, []);
  const reportHistoryBackState = useCallback((canGoBack: boolean) => {
    setNestedBackStates(current =>
      current.history === canGoBack ? current : {...current, history: canGoBack},
    );
  }, []);
  const reportSavedBackState = useCallback((canGoBack: boolean) => {
    setNestedBackStates(current =>
      current.saved === canGoBack ? current : {...current, saved: canGoBack},
    );
  }, []);
  const visitedTabsRef = useRef(new Set<MainScreen>(['saved']));
  const tabSessionRef = useRef(isAuthenticated);
  if (tabSessionRef.current !== isAuthenticated) {
    visitedTabsRef.current = new Set(['saved']);
    tabSessionRef.current = isAuthenticated;
  }
  if (flowState.kind === 'main') visitedTabsRef.current.add(flowState.activeTab);
  useEffect(() => {
    mainTabHistoryRef.current = [];
  }, [isAuthenticated]);
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

  nestedBackStateRef.current = flowState.kind === 'main' &&
    (flowState.activeTab === 'map' ? nestedBackStates.map :
      flowState.activeTab === 'history' ? nestedBackStates.history :
      flowState.activeTab === 'saved' ? nestedBackStates.saved : false);

  const isGuestBrowsing =
    isAuthReady &&
    !isSplashVisible &&
    !isOnboardingVisible &&
    flowState.kind === 'main' &&
    isAuthenticated === false &&
    !hasPendingShareLogin &&
    myPageOverlay === null &&
    requiredUpdateStoreUrl === null &&
    recommendedUpdate === null;

  useEffect(() => {
    if (isAuthenticated) {
      setIsGuestLoginPromptVisible(false);
      guestReturnFlowRef.current = null;
      setShowLoginCloseButton(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === true) {
      rememberSignInOnThisInstall().catch(() => undefined);
    }
  }, [isAuthenticated]);

  const canRequestLocation =
    isAuthReady &&
    !isSplashVisible &&
    !isOnboardingVisible &&
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

  const navigateMainTab = (nextScreen: MainScreen) => {
    if (
      flowState.kind === 'main' &&
      flowState.detailSource === null &&
      flowState.activeTab !== nextScreen
    ) {
      mainTabHistoryRef.current.push(flowState.activeTab);
    }

    openMainScreen(nextScreen);
  };

  const goBackMainTab = useCallback(() => {
    if (flowState.kind !== 'main' || flowState.detailSource !== null) {
      return false;
    }

    const previousTab =
      mainTabHistoryRef.current.pop() ??
      (flowState.activeTab === 'saved' ? null : 'saved');
    if (!previousTab) {
      return false;
    }

    setFlowState(current =>
      current.kind === 'main'
        ? { ...current, activeTab: previousTab, detailSource: null }
        : current,
    );
    return true;
  }, [flowState]);

  const openMainScreenRef = useRef(openMainScreen);
  openMainScreenRef.current = openMainScreen;
  // 공유 결과를 읽는 effect는 isAuthReady에만 의존하므로 현재 화면 흐름과 로그인 여부는 ref로 읽는다.
  const flowStateRef = useRef(flowState);
  flowStateRef.current = flowState;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

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

  const closeDetail = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (myPageOverlay !== null) {
          setMyPageOverlay(null);
          return true;
        }

        if (flowState.kind === 'main' && flowState.detailSource !== null) {
          closeDetail();
          return true;
        }

        if (flowState.kind === 'auth' && flowState.stack.length > 1) {
          setFlowState(current =>
            current.kind === 'auth' && current.stack.length > 1
              ? { ...current, stack: current.stack.slice(0, -1) }
              : current,
          );
          return true;
        }

        if (nestedBackStateRef.current) {
          return false;
        }

        return goBackMainTab();
      },
    );

    return () => subscription.remove();
  }, [closeDetail, flowState, goBackMainTab, myPageOverlay]);

  useEffect(() => {
    let isMounted = true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const syncFlowState = async () => {
      const [tokens, memberId] = await Promise.all([
        getSpringTokens().catch(() => null),
        getSpringMemberId().catch(() => null),
      ]);

      if (!isMounted) {
        return;
      }
      if (!tokens) {
        activeUserIdRef.current = null;
        setIsAuthenticated(false);
        if (!hasTrackedAppOpenedRef.current) {
          trackAppOpened(posthog, false);
          hasTrackedAppOpenedRef.current = true;
        }

        // Spring 세션이 없으면 Supabase 시절이나 다른 회원의 공유 세션이 남지 않게 지웁니다.
        await syncShareSession(null).catch(() => undefined);

        setFlowState(INITIAL_FLOW_STATE);
        setIsOnboardingVisible(true);
        setMyPageOverlay(null);
        setIsAuthReady(true);
        return;
      }

      activeUserIdRef.current = memberId;
      setIsAuthenticated(true);
      resumeWaitingShares().catch(() => undefined);

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

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([
      syncFlowState(),
      checkUpdatePolicy(),
      splashDelay,
    ]).finally(() => {
      if (!isMounted) {
        return;
      }

      setIsSplashVisible(false);
    });

    const unsubscribe = onSpringSessionChange((event, memberId) => {
      if (event === 'SIGNED_IN') {
        resumeWaitingShares().catch(() => undefined);
      }
      // 토큰 회전은 화면 흐름을 바꾸지 않습니다. 공유 세션 동기화는 spring-session이 맡습니다.
      if (!isMounted || event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_OUT') {
        activeUserIdRef.current = null;
        setIsAuthenticated(false);
        setFlowState(INITIAL_FLOW_STATE);
        setIsOnboardingVisible(true);
        setMyPageOverlay(null);
        setIsLogoutPending(false);
        setPendingSocialProvider(null);
        setIsAuthReady(true);
        return;
      }

      setSocialLoginError(null);
      activeUserIdRef.current = memberId;
      setIsAuthenticated(true);
      setIsOnboardingVisible(false);
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
          // 공유 화면에서 로그인을 누르고 넘어온 결과는 열려 있던 공유 상태보다 먼저 처리한다.
          // 둘러보기 중 이전 공유 결과가 남아 있어도 로그인 화면으로 이동해야 한다.
          const pendingLoginResult = [...results].reverse().find(
            item =>
              (item.transferStatus === 'LOGIN_HANDOFF' ||
                item.transferStatus === 'GUEST_LOGIN_PROMPT') &&
              !handledShareResultKeysRef.current.has(
                `${item.requestId ?? item.url}:${item.updatedAt}`,
              ),
          );
          const result = pendingLoginResult
            ? pendingLoginResult
            : latestResult?.transferStatus === 'GUEST_LOGIN_PROMPT'
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
            handledShareResultKeysRef.current.clear();
            if (currentShareState?.source === 'instagram_share') {
              setSharedSaveState(null);
            }
            return;
          }
          const resultKey = `${result.requestId ?? result.url}:${
            result.updatedAt
          }`;
          if (handledShareResultKeysRef.current.has(resultKey)) return;
          handledShareResultKeysRef.current.add(resultKey);
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
            // 로그인 화면으로 보내는 것으로 이 결과의 역할은 끝난다. 로그인해도 이 공유는 추출하지
            // 않으므로, 로그인 대기 상태로 남겨 두지 않고 정리한다.
            const showLoginForHandoff = () => {
              clearShareResult(result.requestId).catch(() => undefined);
              setHasPendingShareLogin(false);
              // 둘러보는 중에 넘어왔다면 앱 안에서 연 로그인 화면과 같게 X로 직전 화면에 돌아간다.
              const currentFlow = flowStateRef.current;
              if (isAuthenticatedRef.current === false && currentFlow.kind === 'main') {
                guestReturnFlowRef.current = currentFlow;
                setShowLoginCloseButton(true);
              }
              setFlowState(INITIAL_FLOW_STATE);
            };
            getSpringTokens().then(tokens => {
              if (tokens) {
                resumeWaitingShares().catch(() => undefined);
                return;
              }
              showLoginForHandoff();
            }).catch(() => {
              captureShareLoginHandoffError('SHARE_LOGIN_STATE_READ_FAILED');
              showLoginForHandoff();
            });
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
    const signIn = {
      apple: signInWithApple,
      kakao: signInWithKakao,
      google: signInWithGoogle,
    }[provider];
    let signInStarted = false;

    // 로그인 버튼을 누른 시점에 기록해, 시작 전에 실패해도 로그인 시도로 센다.
    trackLoginStarted(posthog, provider);

    try {
      // 이전 회원의 공유 세션이 남아 있으면 익스텐션이 엉뚱한 계정으로 저장하지 않게 지웁니다.
      if (!(await getSpringTokens().catch(() => null))) {
        await syncShareSession(null).catch(() => undefined);
      }

      setSocialLoginError(null);
      setPendingSocialProvider(provider);
      signInStarted = true;
      await signIn();
      trackLoginFinished(posthog, {
        provider,
        outcome: 'success',
      });
    } catch (error) {
      const normalizedError = withAuthErrorStage(
        error,
        signInStarted ? 'provider_authorization' : 'login_setup',
      );
      captureSocialLoginError(provider, normalizedError);
      trackLoginFinished(posthog, {
        provider,
        outcome: 'failure',
        failureType: toLoginFailureType(normalizedError),
      });
      if (!signInStarted) {
        Alert.alert('로그인을 시작하지 못했어요', '잠시 후 다시 시도해 주세요.');
        return;
      }
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

  const handleOpenGuestLogin = () => {
    if (flowState.kind !== 'main' || isAuthenticated !== false) return;

    setIsGuestLoginPromptVisible(false);
    guestReturnFlowRef.current = flowState;
    setShowLoginCloseButton(true);
    setFlowState(INITIAL_FLOW_STATE);
  };

  const handleOpenGuestLoginFromMyPage = () => {
    if (flowState.kind !== 'main' || isAuthenticated !== false) return;

    setIsGuestLoginPromptVisible(false);
    guestReturnFlowRef.current = flowState;
    setShowLoginCloseButton(true);
    setFlowState(INITIAL_FLOW_STATE);
  };

  const handleRequireLogin = () => {
    if (isAuthenticated === false) {
      handleOpenGuestLogin();
      return;
    }
    setFlowState(INITIAL_FLOW_STATE);
  };

  const handleShowGuestLoginPrompt = () => {
    if (isAuthenticated === false) {
      setIsGuestLoginPromptVisible(true);
    }
  };

  // 로그아웃 뒤 등 로그인 화면이 첫 화면일 때 비회원 둘러보기로 들어간다.
  const handleBrowseAsGuest = () => {
    setSocialLoginError(null);
    setShowLoginCloseButton(false);
    setFlowState(GUEST_MAIN_FLOW_STATE);
  };

  const handleContinueBrowsing = () => {
    const previousFlow = guestReturnFlowRef.current;
    if (!previousFlow) return;

    guestReturnFlowRef.current = null;
    setShowLoginCloseButton(false);
    setFlowState(previousFlow);
  };

  const handleCloseGuestLogin = () => {
    const previousFlow = guestReturnFlowRef.current;
    guestReturnFlowRef.current = null;
    setShowLoginCloseButton(false);
    setFlowState(previousFlow ?? GUEST_MAIN_FLOW_STATE);
  };

  const handleBrowseFromLogin = async () => {
    if (guestReturnFlowRef.current) {
      handleContinueBrowsing();
      return;
    }

    if (hasPendingShareLogin) {
      await handleCancelShareLogin();
    }
    handleBrowseAsGuest();
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
    // 온보딩을 거쳐 로그인 화면에 간다. 로컬 정리에 실패하면 로그인 상태를 유지하고 다시 시도하게 한다.
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

  const requireLoginHandlerRef = useRef(handleRequireLogin);
  requireLoginHandlerRef.current = handleRequireLogin;
  const requestLogin = useCallback(() => requireLoginHandlerRef.current(), []);

  const renderScreen = (screen: Screen) => {
    if (screen === 'history') {
      return (
        <HistoryScreen
          guestReels={isAuthenticated === false ? [] : undefined}
          onBack={goBackMainTab}
          isActive={currentScreen === 'history' && myPageOverlay === null}
          onNestedBackStateChange={reportHistoryBackState}
          onRequireLogin={requestLogin}
        />
      );
    }

    if (screen === 'login') {
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
          onClose={showLoginCloseButton ? handleCloseGuestLogin : undefined}
          onBrowseAsGuest={
            isAuthenticated === false && !showLoginCloseButton
              ? handleBrowseFromLogin
              : undefined
          }
        />
      );
    }

    if (screen === 'emailLogin') {
      return (
        <EmailLoginScreen
          onBack={popAuthScreen}
          onLogin={() => showPreparingAlert('이메일 로그인')}
          onOpenSignup={() => pushAuthScreen('signup')}
          onOpenTerms={() => pushAuthScreen('terms')}
        />
      );
    }

    if (screen === 'signup') {
      return (
        <SignUpScreen
          onBack={popAuthScreen}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onOpenTerms={() => pushAuthScreen('terms')}
          onSignUp={() => showPreparingAlert('이메일 회원가입')}
        />
      );
    }

    if (screen === 'terms') {
      return <TermsAgreementScreen onBack={popAuthScreen} />;
    }

    if (screen === 'saved') {
      // 대기함 복원 시 onOpenInbox={() => openMainScreen('inBox')} 연결을 되살립니다.
      return (
        <SavedPlacesScreen
          key={
            isAuthenticated === false
              ? 'guest-saved'
              : 'member-saved'
          }
          isActive={currentScreen === 'saved' && myPageOverlay === null}
          onNestedBackStateChange={reportSavedBackState}
          initialScrollOffset={savedPlacesScrollOffsetRef.current}
          isGuest={isAuthenticated === false}
          places={isAuthenticated === false ? [] : undefined}
          onAuthenticationRequired={requestLogin}
          onOpenGuide={() => setMyPageOverlay('guide')}
          onShowGuestLoginPrompt={handleShowGuestLoginPrompt}
          onEditModeChange={setIsSavedPlacesEditing}
          onOpenDetail={(place, context) =>
            openDetailFrom('saved', place, context)
          }
          onScrollOffsetChange={offset => {
            savedPlacesScrollOffsetRef.current = offset;
          }}
          onRequireLogin={requestLogin}
          onSharedResultConsumed={clearShareResult}
        />
      );
    }

    // 대기함 흐름을 다시 사용할 때 복원합니다.
    /*
    if (screen === 'inBox') {
      return (
        <InBoxScreen
          entryType={inBoxEntryType}
          guestItems={isAuthenticated === false ? EMPTY_GUEST_INBOX : undefined}
          onOpenHistory={() => openMainScreen('history')}
          onRequireLogin={requestLogin}
          onSelectionChange={setIsInBoxSelecting}
        />
      );
    }

    */

    if (screen === 'map') {
      return (
        <MapScreen
          onBackGestureRegionChange={reportMapBackGestureRegion}
          bottomNavigationBar={
            <BottomNavigationBar active="map" isGuest={isAuthenticated === false} onNavigate={navigateMainTab} />
          }
          key={
            isAuthenticated === false
              ? 'guest-map'
              : 'member-map'
          }
          isGuest={isAuthenticated === false}
          isActive={currentScreen === 'map' && myPageOverlay === null}
          onNestedBackStateChange={reportMapBackState}
          onAuthenticationRequired={requestLogin}
          onShowGuestLoginPrompt={handleShowGuestLoginPrompt}
        />
      );
    }

    if (screen === 'detail' && selectedPlace) {
      return (
        <PlaceDetailScreen
          bottomNavigationBar={
            flowState.kind === 'main' && flowState.detailSource !== null ? (
              <BottomNavigationBar
                active={flowState.activeTab}
                isGuest={isAuthenticated === false}
                onNavigate={navigateMainTab}
              />
            ) : undefined
          }
          onBack={closeDetail}
          onAuthenticationRequired={requestLogin}
          isGuest={isAuthenticated === false}
          place={selectedPlace}
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
        onLogin={handleOpenGuestLoginFromMyPage}
        onOpenTerms={() => setMyPageOverlay('terms')}
        onRetryProfile={handleRetryProfile}
        onWithdraw={handleOpenAccountDeletion}
        profileError={profileError}
      />
    );
  };

  const renderMyPageOverlay = () => {
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

    return null;
  };

  const isMapScreen = currentScreen === 'map';
  const previousTab = flowState.kind === 'main'
    ? mainTabHistoryRef.current[mainTabHistoryRef.current.length - 1] ??
      (flowState.activeTab === 'saved' ? null : 'saved')
    : null;
  const activeLayerKey = flowState.kind === 'auth'
    ? `auth-${flowState.stack.length - 1}-${currentScreen}`
    : myPageOverlay !== null ? `myPage-${myPageOverlay}`
    : flowState.detailSource !== null ? 'detail' : flowState.activeTab;
  const backLayerKey = flowState.kind === 'auth'
    ? flowState.stack.length > 1
      ? `auth-${flowState.stack.length - 2}-${flowState.stack[flowState.stack.length - 2]}`
      : null
    : myPageOverlay !== null ? flowState.activeTab
    : flowState.detailSource ?? previousTab;

  const handleSwipeBack = () => {
    if (myPageOverlay !== null) setMyPageOverlay(null);
    else if (flowState.kind === 'auth') popAuthScreen();
    else if (flowState.detailSource !== null) closeDetail();
    else goBackMainTab();
  };

  const wrapScreen = (content: React.ReactNode, map = false) => (
    <SafeAreaView edges={map ? ['left', 'right'] : ['top', 'left', 'right']} style={styles.safeArea}>
      {content}
    </SafeAreaView>
  );
  const screenLayers: BackScreen[] = flowState.kind === 'auth'
    ? flowState.stack.map((screen, index) => ({
        key: `auth-${index}-${screen}`,
        content: wrapScreen(renderScreen(screen)),
      }))
    : [...visitedTabsRef.current].map(tab => ({
        key: tab,
        content: wrapScreen(
          <View style={styles.container}>
            {renderScreen(tab)}
            {tab !== 'map' && !(tab === 'saved' && isSavedPlacesEditing) ? (
              <BottomNavigationBar active={tab} isGuest={isAuthenticated === false} onNavigate={navigateMainTab} />
            ) : null}
          </View>, tab === 'map',
        ),
      }));
  if (flowState.kind === 'main' && flowState.detailSource !== null) {
    screenLayers.push({key: 'detail', content: wrapScreen(renderScreen('detail'))});
  }
  if (flowState.kind === 'main' && myPageOverlay !== null) {
    screenLayers.push({key: `myPage-${myPageOverlay}`, content: wrapScreen(renderMyPageOverlay())});
  }

  if (!isAuthReady || isSplashVisible) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#DBE0F9" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (isOnboardingVisible) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <SafeAreaView
          edges={['top', 'left', 'right', 'bottom']}
          style={styles.safeArea}
        >
          <OnboardingScreen onComplete={() => setIsOnboardingVisible(false)} />
        </SafeAreaView>
        {/* 필수 업데이트는 온보딩 중에도 막는다. 권장 업데이트는 온보딩 뒤에 안내한다. */}
        <AppUpdateModal
          mode="required"
          storeUrl={requiredUpdateStoreUrl ?? ''}
          visible={requiredUpdateStoreUrl !== null}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={isMapScreen ? 'transparent' : '#ffffff'}
        translucent={isMapScreen}
      />
      <SwipeBackStack
        key={`${flowState.kind}-${isAuthenticated}`}
        screens={screenLayers}
        activeKey={activeLayerKey}
        gestureRegion={currentScreen === 'map' ? mapBackGestureRegion : undefined}
        backKey={backLayerKey}
        onBack={handleSwipeBack}
        enabled={!nestedBackStateRef.current || currentScreen === 'detail' || myPageOverlay !== null}
      />
      {currentScreen === 'detail' ? <SystemNavigationGradient /> : null}
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
        visible={isGuestLoginPromptVisible && isGuestBrowsing}
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
