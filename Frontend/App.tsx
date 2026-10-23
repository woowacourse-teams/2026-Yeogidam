import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import {setAnalyticsGuestMode} from './src/analytics/analytics';
import { configureDataSources } from './src/app/configureDataSources';
import {
  BottomNavigationBar,
  SystemNavigationGradient,
} from './src/components/BottomNavigationBar';
import {SwipeBackStack, type BackScreen, type BackGestureRegion} from './src/components/navigation/SwipeBackStack';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { AppUpdateModal } from './src/components/AppUpdateModal';
import type { HistoryReel } from './src/entities/content/types';
import type { Place } from './src/entities/place/types';
import { isAppleSignInSupported } from './src/lib/auth/signInWithApple';
import type {
  AccountDeletionProvider,
  DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import { openKakaoChannelChat } from './src/lib/support/openKakaoChannelChat';
import { useAppUpdatePolicy } from './src/app/useAppUpdatePolicy';
import { useSplashGate } from './src/app/useSplashGate';
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
import { clearSavedPlacesCache } from './src/entities/info/saved-places-cache';
import { SplashScreen } from './src/pages/splash/SplashScreen';
import { clearShareResult } from './src/lib/share-intent';
import { authLayerKey, selectActiveLayerKey, selectBackLayerKey } from './src/app/navigation';
import { useAndroidBackPress } from './src/app/useAndroidBackPress';
import { useAppNavigation } from './src/app/useAppNavigation';
import { useCurrentProfile } from './src/app/useCurrentProfile';
import { useGuestLoginPrompt } from './src/app/useGuestLoginPrompt';
import { useLocationPermissionRequest } from './src/app/useLocationPermissionRequest';
import { useNativeShareResults, type ShareFailureNotice } from './src/app/useNativeShareResults';
import { useNestedBackStates } from './src/app/useNestedBackStates';
import { useShareAnalyticsFlush } from './src/app/useShareAnalyticsFlush';
import { useSpringAuthFlow } from './src/app/useSpringAuthFlow';
import type { SocialProvider } from './src/lib/auth/social-provider';
import type { MainScreen, Screen } from './src/types/navigation';
import { initSentry, withSentry } from './src/lib/monitoring/sentry';

initSentry();

/** 공유 결과가 실패로 끝났을 때 종류별로 띄우는 안내입니다. 훅은 종류만 알리고 문구는 여기서 고릅니다. */
const SHARE_FAILURE_ALERTS: Record<ShareFailureNotice, {title: string; message: string}> = {
  'session-expired': {
    title: '공유한 게시물을 저장하지 못했어요',
    message: '로그인 정보가 만료됐어요. 게시물을 다시 공유해 주세요.',
  },
  'login-required': {
    title: '로그인이 필요해요',
    message: '다시 로그인한 뒤 게시물을 공유해 주세요.',
  },
  'extraction-failed': {
    title: '장소 추출 실패',
    message: '공유한 콘텐츠의 장소를 추출하지 못했어요.',
  },
};

type MyPageOverlay = 'terms' | 'accountDeletion' | 'guide' | null;

// 비회원 보관함과 히스토리는 목데이터 없이 비어 있습니다. 렌더마다 새 배열을 만들지 않도록 고정합니다.
const EMPTY_GUEST_PLACES: Place[] = [];
const EMPTY_GUEST_REELS: HistoryReel[] = [];

/** 지도가 뒤로 가기 스와이프 영역을 알려 주기 전에는 스와이프를 받지 않습니다. */
const NO_BACK_GESTURE_REGION: BackGestureRegion = {top: Number.MAX_SAFE_INTEGER, bottom: 0};

configureDataSources();

function App() {
  const posthog = usePostHog();
  useShareAnalyticsFlush();
  const {
    flow: flowState,
    selectedPlace,
    selectedPlaceViewContext,
    visitedTabs,
    guestReturnFlow,
    showLoginCloseButton,
    previousTab,
    canGoBackMainTab,
    currentScreen,
    pushAuthScreen,
    popAuthScreen,
    openMainScreen,
    navigateMainTab,
    goBackMainTab,
    openDetail,
    closeDetail,
    openLogin,
    openLoginFromGuest,
    openLoginFromGuestShare,
    returnToGuestFlow,
    closeGuestLogin,
    openGuestMain,
    openMemberMain,
    endSession,
  } = useAppNavigation();
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  // 로그아웃 상태로 앱을 열면 이번 실행 동안 로그인 화면 앞에 온보딩을 보여준다.
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(false);
  const {
    requiredUpdateStoreUrl,
    recommendedUpdate,
    refreshUpdatePolicy,
    dismissRecommendedUpdate,
  } = useAppUpdatePolicy();
  const {isSplashVisible} = useSplashGate(refreshUpdatePolicy);
  const savedPlacesScrollOffsetRef = useRef(0);
  const {
    authStatus,
    isLogoutPending,
    pendingSocialProvider,
    socialLoginError,
    continueWithSocial,
    clearSocialLoginError,
    logout,
    resolveDeletionProviders,
    deleteAccountAndSignOut,
  } = useSpringAuthFlow({posthog}, {
    // 이 handlers와 아래 useNativeShareResults의 handlers는 렌더가 끝난 뒤(effect와 세션 이벤트)에만 불립니다.
    // 그래서 더 아래에서 선언되는 resetPendingShareLogin과 dismissGuestLoginPrompt를 써도 선언 전 접근이 되지 않습니다.
    // 타입 검사와 lint는 닫힌 함수 안의 선언 전 참조를 잡지 않으므로, 렌더 중에 부르는 핸들러를 더하면 안 됩니다.
    onGuestSession: () => {
      // 로그아웃, 세션 만료, 탈퇴는 모두 여기를 지나므로 이전 회원의 보관함 목록이 다음 회원에게 보이지 않게 비웁니다.
      clearSavedPlacesCache();
      // 세션이 없으면 온보딩을 거쳐 로그인 화면으로 갑니다. 비회원 둘러보기는 로그인 화면에서 고릅니다.
      endSession();
      setIsOnboardingVisible(true);
      setMyPageOverlay(null);
    },
    onMemberSession: source => {
      // 방금 로그인했으면 이전 회원이나 비회원이 보던 보관함 스크롤 위치를 남기지 않습니다.
      if (source === 'signed-in') savedPlacesScrollOffsetRef.current = 0;
      // 로그인 세션이 복원되거나 로그인하면 온보딩을 건너뜁니다.
      setIsOnboardingVisible(false);
      // 회원이 되면 돌아갈 비회원 흐름과 탭 이력(openMemberMain이 비움)과 공유 로그인 표시를 내립니다. 로그인 유도는 훅이 스스로 내립니다.
      openMemberMain();
      resetPendingShareLogin();
    },
  });
  const isAuthReady = authStatus !== 'loading';
  const isGuest = authStatus === 'guest';
  const isMember = authStatus === 'member';
  useEffect(() => {
    setAnalyticsGuestMode(isAuthReady ? isGuest : null);
  }, [isAuthReady, isGuest]);
  const {currentProfile, profileError, isProfileLoading, retryProfile, clearProfile} =
    useCurrentProfile(flowState.kind === 'main' && isMember);
  const [isSavedPlacesEditing, setIsSavedPlacesEditing] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  const {nestedBackStates, reportMapBackState, reportHistoryBackState, reportSavedBackState} =
    useNestedBackStates();
  const [mapBackGestureRegion, setMapBackGestureRegion] =
    useState<BackGestureRegion>(NO_BACK_GESTURE_REGION);
  const reportMapBackGestureRegion = useCallback((region: BackGestureRegion) => {
    setMapBackGestureRegion(current =>
      current.top === region.top && current.bottom === region.bottom ? current : region,
    );
  }, []);
  // 지금 보이는 탭 화면이 스스로 뒤로 갈 수 있으면 뒤로 가기를 그 화면에 맡깁니다.
  const canNestedGoBack = flowState.kind === 'main' && nestedBackStates[flowState.activeTab];

  // isGuestBrowsing이 hasPendingShareLogin을 읽어야 해서 useGuestLoginPrompt를 useNativeShareResults보다 먼저 부를 수 없습니다.
  const {hasPendingShareLogin, cancelPendingShareLogin, resetPendingShareLogin} =
    useNativeShareResults(isAuthReady, {
      onGuestLoginPrompt: () => {
        dismissGuestLoginPrompt();
        setMyPageOverlay(null);
        openLoginFromGuestShare();
      },
      onOpenSavedPlaces: reason => {
        if (reason === 'guest-preview') {
          dismissGuestLoginPrompt();
          setMyPageOverlay(null);
        }
        openMainScreen('saved');
      },
      onLoginHandoff: () => {
        // 둘러보는 중에 넘어왔다면 앱 안에서 연 로그인 화면과 같게 X로 직전 화면에 돌아간다.
        if (isGuest && flowState.kind === 'main') {
          openLoginFromGuest(flowState);
          return;
        }
        openLogin();
      },
      onLoginRequired: openLogin,
      onShareFailed: notice => {
        const {title, message} = SHARE_FAILURE_ALERTS[notice];
        Alert.alert(title, message);
      },
    });

  // 스플래시와 온보딩이 끝나고 세션이 확인된 메인 흐름입니다. 비회원 로그인 유도와 위치 권한 요청의 공통 전제입니다.
  const isMainVisible =
    isAuthReady && !isSplashVisible && !isOnboardingVisible && flowState.kind === 'main';
  // 비회원이 메인 화면을 방해 없이 보고 있는 상태입니다. 겹침 화면과 업데이트 안내와 공유 로그인이 없을 때만입니다.
  const isGuestBrowsing =
    isMainVisible &&
    isGuest &&
    !hasPendingShareLogin &&
    myPageOverlay === null &&
    requiredUpdateStoreUrl === null &&
    recommendedUpdate === null;

  const {isGuestLoginPromptVisible, showGuestLoginPrompt, dismissGuestLoginPrompt} =
    useGuestLoginPrompt({isGuestBrowsing, isMember});

  useLocationPermissionRequest(isMainVisible && !requiredUpdateStoreUrl);

  const handleContinueWithSocial = async (provider: SocialProvider) => {
    const outcome = await continueWithSocial(provider);
    if (outcome === 'setup-failed') {
      Alert.alert('로그인을 시작하지 못했어요', '잠시 후 다시 시도해 주세요.');
    }
  };

  const handleLogout = async () => {
    const outcome = await logout();
    if (outcome === 'failed') {
      Alert.alert('로그아웃 실패', '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  // 비회원이 앱 안에서(로그인 유도, 내 정보, 로그인이 필요한 기능) 로그인 화면을 열면 X로 보던 화면에 돌아갑니다.
  const handleOpenGuestLogin = () => {
    if (flowState.kind !== 'main' || !isGuest) return;

    dismissGuestLoginPrompt();
    openLoginFromGuest(flowState);
  };

  const handleRequireLogin = () => {
    if (isGuest) {
      handleOpenGuestLogin();
      return;
    }
    openLogin();
  };

  // 탭 화면은 탭을 옮겨도 내려가지 않으므로, 로그인 요청 콜백은 참조를 고정해 화면의 effect가 다시 돌지 않게 합니다.
  const requireLoginHandlerRef = useRef(handleRequireLogin);
  requireLoginHandlerRef.current = handleRequireLogin;
  const requestLogin = useCallback(() => requireLoginHandlerRef.current(), []);

  const handleShowGuestLoginPrompt = () => {
    if (isGuest) {
      showGuestLoginPrompt();
    }
  };

  // 로그아웃 뒤 등 로그인 화면이 첫 화면일 때 비회원 둘러보기로 들어간다.
  const handleBrowseAsGuest = () => {
    clearSocialLoginError();
    openGuestMain();
  };

  // "로그인 없이 둘러보기"입니다. 돌아갈 비회원 흐름이 있으면 그리로, 넘겨받은 공유가 있으면 지우고 비회원 메인으로 갑니다.
  const handleBrowseFromLogin = async () => {
    if (guestReturnFlow) {
      returnToGuestFlow();
      return;
    }

    if (hasPendingShareLogin) {
      await cancelPendingShareLogin();
    }
    handleBrowseAsGuest();
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
    endSession();
    Alert.alert('회원탈퇴 완료', '회원탈퇴가 완료되었어요.');
  };

  // Android 시스템 뒤로 가기: 겹침 화면, 상세, 인증 스택, 탭 이력 순으로 되돌리고, 탭 화면이 스스로 뒤로 갈 수 있으면 그 화면에 맡긴다.
  useAndroidBackPress(() => {
    if (myPageOverlay !== null) {
      setMyPageOverlay(null);
      return true;
    }

    if (flowState.kind === 'main' && flowState.detailSource !== null) {
      closeDetail();
      return true;
    }

    if (flowState.kind === 'auth' && flowState.stack.length > 1) {
      popAuthScreen();
      return true;
    }

    if (canNestedGoBack || !canGoBackMainTab) {
      return false;
    }

    goBackMainTab();
    return true;
  });

  const renderBottomNavigationBar = (active: MainScreen) => (
    <BottomNavigationBar active={active} isGuest={isGuest} onNavigate={navigateMainTab} />
  );

  const renderScreen = (screen: Screen) => {
    if (screen === 'history') {
      return (
        <HistoryScreen
          guestReels={isGuest ? EMPTY_GUEST_REELS : undefined}
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
          onClose={showLoginCloseButton ? closeGuestLogin : undefined}
          onBrowseAsGuest={isGuest && !showLoginCloseButton ? handleBrowseFromLogin : undefined}
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
      return (
        <SavedPlacesScreen
          key={isGuest ? 'guest-saved' : 'member-saved'}
          isActive={currentScreen === 'saved' && myPageOverlay === null}
          onNestedBackStateChange={reportSavedBackState}
          initialScrollOffset={savedPlacesScrollOffsetRef.current}
          isGuest={isGuest}
          places={isGuest ? EMPTY_GUEST_PLACES : undefined}
          onAuthenticationRequired={requestLogin}
          onOpenGuide={() => setMyPageOverlay('guide')}
          onShowGuestLoginPrompt={handleShowGuestLoginPrompt}
          onEditModeChange={setIsSavedPlacesEditing}
          onOpenDetail={(place, context) => openDetail('saved', place, context)}
          onScrollOffsetChange={offset => {
            savedPlacesScrollOffsetRef.current = offset;
          }}
          onRequireLogin={requestLogin}
          onSharedResultConsumed={clearShareResult}
        />
      );
    }

    if (screen === 'map') {
      return (
        <MapScreen
          key={isGuest ? 'guest-map' : 'member-map'}
          onBackGestureRegionChange={reportMapBackGestureRegion}
          bottomNavigationBar={renderBottomNavigationBar('map')}
          isGuest={isGuest}
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
            flowState.kind === 'main' && flowState.detailSource !== null
              ? renderBottomNavigationBar(flowState.activeTab)
              : undefined
          }
          onBack={closeDetail}
          onAuthenticationRequired={requestLogin}
          place={selectedPlace}
          viewContext={selectedPlaceViewContext ?? undefined}
        />
      );
    }

    return (
      <MyPageScreen
        currentProfile={currentProfile}
        isGuest={isGuest}
        isProfileLoading={isProfileLoading}
        isLogoutPending={isLogoutPending}
        onOpenContact={openKakaoChannelChat}
        onOpenGuide={() => setMyPageOverlay('guide')}
        onLogout={handleLogout}
        onLogin={handleOpenGuestLogin}
        onOpenTerms={() => setMyPageOverlay('terms')}
        onRetryProfile={retryProfile}
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
  const activeLayerKey = selectActiveLayerKey(flowState, myPageOverlay);
  const backLayerKey = selectBackLayerKey(flowState, myPageOverlay, previousTab);

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
  // 인증 흐름은 스택의 화면을, 메인 흐름은 머문 탭을 모두 층으로 두어 탭을 옮겨도 화면이 내려가지 않게 합니다.
  const screenLayers: BackScreen[] = flowState.kind === 'auth'
    ? flowState.stack.map((screen, index) => ({
        key: authLayerKey(index, screen),
        content: wrapScreen(renderScreen(screen)),
      }))
    : visitedTabs.map(tab => ({
        key: tab,
        content: wrapScreen(
          <View style={styles.container}>
            {renderScreen(tab)}
            {tab !== 'map' && !(tab === 'saved' && isSavedPlacesEditing)
              ? renderBottomNavigationBar(tab)
              : null}
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
        key={`${flowState.kind}-${authStatus}`}
        screens={screenLayers}
        activeKey={activeLayerKey}
        gestureRegion={isMapScreen ? mapBackGestureRegion : undefined}
        backKey={backLayerKey}
        onBack={handleSwipeBack}
        enabled={!canNestedGoBack || currentScreen === 'detail' || myPageOverlay !== null}
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
        onDismiss={dismissRecommendedUpdate}
      />
      <GuestLoginPrompt
        visible={isGuestLoginPromptVisible}
        onLogin={handleOpenGuestLogin}
        onContinueBrowsing={dismissGuestLoginPrompt}
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
