import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import { ensureLocationPermission } from './src/lib/location-permission';
import {setAnalyticsGuestMode} from './src/analytics/analytics';
import { configureDataSources } from './src/app/configureDataSources';
import { BottomNavigationBar } from './src/components/BottomNavigationBar';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { AppUpdateModal } from './src/components/AppUpdateModal';
import type { PlaceReel } from './src/entities/info/types';
import type {HistoryReel} from './src/entities/content/types';
import type { Place } from './src/entities/place/types';
import {
  ONBOARDING_HISTORY_DETAIL,
  ONBOARDING_HISTORY_REEL,
  ONBOARDING_PLACES,
  ONBOARDING_PLACE_REELS,
} from './src/entities/onboarding/data';
import { isAppleSignInSupported } from './src/lib/auth/signInWithApple';
import type {
  AccountDeletionProvider,
  DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import { openKakaoChannelChat } from './src/lib/support/openKakaoChannelChat';
import { flushShareAnalytics } from './src/lib/share-intent/posthog-share';
import { useAppUpdatePolicy } from './src/app/useAppUpdatePolicy';
import { ForegroundElapsedTimer } from './src/lib/foreground-elapsed-timer';
import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
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
  syncShareAnalyticsConfiguration,
} from './src/lib/share-intent';
import { GUEST_MAIN_FLOW_STATE } from './src/app/navigation';
import { useAppNavigation } from './src/app/useAppNavigation';
import { useCurrentProfile } from './src/app/useCurrentProfile';
import { useNativeShareResults } from './src/app/useNativeShareResults';
import { useSpringAuthFlow } from './src/app/useSpringAuthFlow';
import type { SocialProvider } from './src/lib/auth/social-provider';
import { initSentry, withSentry } from './src/lib/monitoring/sentry';

initSentry();

// const EMPTY_GUEST_INBOX: InboxReel[] = [];
const GUEST_HISTORY_REELS: HistoryReel[] = [ONBOARDING_HISTORY_REEL];
// 비회원 장소에 게시물이 없을 때 렌더마다 새 배열을 만들지 않도록 고정합니다.
const EMPTY_GUEST_PLACE_REELS: PlaceReel[] = [];
const GUEST_HISTORY_DETAILS = {
  [ONBOARDING_HISTORY_REEL.id]: ONBOARDING_HISTORY_DETAIL,
};
const SPLASH_MIN_DURATION_MS = 2000;
const GUEST_LOGIN_PROMPT_DELAY_MS = 3 * 60 * 1000;

type MyPageOverlay = 'terms' | 'accountDeletion' | 'guide' | null;

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
  const {
    flow: flowState,
    selectedPlace,
    selectedPlaceViewContext,
    guestReturnFlow,
    currentScreen,
    pushAuthScreen,
    popAuthScreen,
    openMainScreen,
    closeHistory,
    openDetail,
    closeDetail,
    openLogin,
    openGuestLogin,
    continueBrowsing,
    forgetGuestReturnFlow,
    openGuestMain,
    openMemberMain,
  } = useAppNavigation();
  const [guestPlaces, setGuestPlaces] = useState<Place[]>(ONBOARDING_PLACES);
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  const savedPlacesScrollOffsetRef = useRef(0);
  const {
    authStatus,
    isLogoutPending,
    pendingSocialProvider,
    socialLoginError,
    memberDataRevision,
    cancelGuestTransfer,
    continueWithSocial,
    clearSocialLoginError,
    logout,
    resolveDeletionProviders,
    deleteAccountAndSignOut,
    markSignedInOnThisInstall,
  } = useSpringAuthFlow(posthog, {
    onGuestSession: signedInOnThisInstall => {
      if (signedInOnThisInstall) openLogin();
      else openGuestMain();
      setMyPageOverlay(null);
    },
    onMemberSession: source => {
      // 방금 로그인했으면 이전 회원이나 비회원이 보던 보관함 스크롤 위치를 남기지 않습니다.
      if (source === 'signed-in') savedPlacesScrollOffsetRef.current = 0;
      openMemberMain();
    },
  });
  const isAuthReady = authStatus !== 'loading';
  const isAuthenticated = authStatus === 'loading' ? null : authStatus === 'member';
  useEffect(() => {
    setAnalyticsGuestMode(isAuthenticated === null ? null : !isAuthenticated);
  }, [isAuthenticated]);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [hasCompletedGuide, setHasCompletedGuide] = useState<boolean | null>(
    null,
  );
  const {
    requiredUpdateStoreUrl,
    recommendedUpdate,
    refreshUpdatePolicy,
    dismissRecommendedUpdate,
  } = useAppUpdatePolicy();
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
  const {currentProfile, profileError, isProfileLoading, retryProfile, clearProfile} =
    useCurrentProfile(flowState.kind === 'main' && isAuthenticated === true);
  const [isSavedPlacesEditing, setIsSavedPlacesEditing] = useState(false);
  // const [isInBoxSelecting, setIsInBoxSelecting] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  // const [inBoxEntryType, setInBoxEntryType] = useState<InboxEntryType>('direct');

  const {hasPendingShareLogin, cancelPendingShareLogin, resetPendingShareLogin} =
    useNativeShareResults(isAuthReady, {
      onGuestLoginPrompt: () => {
        setIsGuestLoginPromptVisible(false);
        setMyPageOverlay(null);
        openGuestLogin(GUEST_MAIN_FLOW_STATE);
      },
      onOpenSavedPlaces: reason => {
        if (reason === 'guest-preview') {
          setIsGuestLoginPromptVisible(false);
          setMyPageOverlay(null);
        }
        // v2 대기함 흐름 복원 시: saveMode가 REVIEW_QUEUE면 'inBox'를 연다.
        openMainScreen('saved');
      },
      onLoginRequired: openLogin,
    });

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

  // 회원이 되면 비회원 로그인 유도와 공유 로그인 표시, 돌아갈 비회원 흐름을 모두 내립니다.
  useEffect(() => {
    if (isAuthenticated) {
      guestLoginPromptTimer.cancel();
      setIsGuestLoginPromptVisible(false);
      forgetGuestReturnFlow();
      resetPendingShareLogin();
    }
  }, [forgetGuestReturnFlow, guestLoginPromptTimer, isAuthenticated, resetPendingShareLogin]);

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
      markSignedInOnThisInstall();
    }
  }, [hasCompletedGuide, isAuthenticated, markSignedInOnThisInstall]);

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

  // 세션 확인은 useSpringAuthFlow가 맡고, 여기서는 안내 완료 여부와 업데이트 정책을 읽는 동안
  // 스플래시를 최소 시간만큼 보여 줍니다. 세션이 아직 확인되지 않았으면 스플래시가 계속 남습니다.
  useEffect(() => {
    let isMounted = true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const loadGuideCompletion = async () => {
      const [completed, signedInOnThisInstall] = await Promise.all([
        hasCompletedAppGuide(),
        hasSignedInOnThisInstall(),
      ]);

      if (isMounted) {
        setHasCompletedGuide(completed || signedInOnThisInstall);
      }
    };

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([
      refreshUpdatePolicy(),
      loadGuideCompletion(),
      splashDelay,
    ]).finally(() => {
      if (!isMounted) {
        return;
      }

      setIsSplashVisible(false);
    });

    return () => {
      isMounted = false;
      if (splashTimer) {
        clearTimeout(splashTimer);
      }
    };
  }, [refreshUpdatePolicy]);

  const handleContinueWithSocial = (provider: SocialProvider) => {
    // 안내를 마친 비회원이 로그인하면 그때 보관함에 남은 장소를 가입 뒤 옮깁니다.
    const guestTransferPlaces =
      isAuthenticated === false && hasCompletedGuide === true ? guestPlaces : null;
    return continueWithSocial(provider, guestTransferPlaces);
  };

  const handleCompleteGuide = () => {
    setHasCompletedGuide(true);
    completeAppGuide();
  };

  const handleOpenGuestLogin = () => {
    if (flowState.kind !== 'main' || isAuthenticated !== false) return;

    setIsGuestLoginPromptVisible(false);
    openGuestLogin(flowState);
  };

  const handleRequireLogin = () => {
    if (isAuthenticated === false) {
      handleOpenGuestLogin();
      return;
    }
    openLogin();
  };

  // 로그아웃 뒤 등 로그인 화면이 첫 화면일 때 비회원 둘러보기로 들어간다.
  const handleBrowseAsGuest = () => {
    clearSocialLoginError();
    openGuestMain();
  };

  const handleContinueBrowsing = () => {
    if (!guestReturnFlow) return;

    cancelGuestTransfer();
    continueBrowsing();
  };

  const showPreparingAlert = (featureName: string) => {
    Alert.alert('준비 중', `${featureName} 기능은 아직 준비 중이에요.`);
  };

  const handleOpenAccountDeletion = async () => {
    const providers = await resolveDeletionProviders(currentProfile);

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

  // 재인증 문제처럼 사용자가 고칠 수 있는 실패는 그대로 던져져 탈퇴 화면이 안내한다.
  const handleDeleteAccount = async (payload: DeleteAccountRequest) => {
    const outcome = await deleteAccountAndSignOut(payload);

    if (outcome === 'cleanup-failed') {
      Alert.alert(
        '회원탈퇴를 마무리하지 못했어요',
        '앱을 완전히 종료한 뒤 다시 실행해 주세요.',
      );
      return;
    }

    clearProfile();
    setMyPageOverlay(null);
    openLogin();
    Alert.alert('회원탈퇴 완료', '회원탈퇴가 완료되었어요.');
  };

  const renderScreen = () => {
    if (currentScreen === 'history') {
      return (
        <HistoryScreen
          guestReels={isAuthenticated === false ? GUEST_HISTORY_REELS : undefined}
          guestDetails={isAuthenticated === false ? GUEST_HISTORY_DETAILS : undefined}
          onBack={closeHistory}
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
          onCancelShareLogin={hasPendingShareLogin ? cancelPendingShareLogin : undefined}
          onContinueBrowsing={guestReturnFlow ? handleContinueBrowsing : undefined}
          onBrowseAsGuest={
            isAuthenticated === false &&
            !guestReturnFlow &&
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
          onOpenDetail={(place, context) => openDetail('saved', place, context)}
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
              ? ONBOARDING_PLACE_REELS[selectedPlace.id] ?? EMPTY_GUEST_PLACE_REELS
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
        onLogout={logout}
        onLogin={handleOpenGuestLogin}
        onOpenTerms={() => setMyPageOverlay('terms')}
        onRetryProfile={retryProfile}
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
        onDismiss={dismissRecommendedUpdate}
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

export default withSentry(App);
