import React, { useEffect, useRef, useState } from 'react';
import { Alert, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';

import {setAnalyticsGuestMode} from './src/analytics/analytics';
import { configureDataSources } from './src/app/configureDataSources';
import { BottomNavigationBar } from './src/components/BottomNavigationBar';
import { GuestLoginPrompt } from './src/components/GuestLoginPrompt';
import { AppUpdateModal } from './src/components/AppUpdateModal';
import type { PlaceReel } from './src/entities/info/types';
import type {HistoryReel} from './src/entities/content/types';
import {
  ONBOARDING_HISTORY_DETAIL,
  ONBOARDING_HISTORY_REEL,
  ONBOARDING_PLACE_REELS,
} from './src/entities/onboarding/data';
import { isAppleSignInSupported } from './src/lib/auth/signInWithApple';
import type {
  AccountDeletionProvider,
  DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import { openKakaoChannelChat } from './src/lib/support/openKakaoChannelChat';
import { useAppUpdatePolicy } from './src/app/useAppUpdatePolicy';
import { useGuestSeedPlaces } from './src/app/useGuestSeedPlaces';
import { useSplashGate } from './src/app/useSplashGate';
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
import { clearSavedPlacesCache } from './src/entities/info/saved-places-cache';
import { SplashScreen } from './src/pages/splash/SplashScreen';
import { clearShareResult } from './src/lib/share-intent';
import { GUEST_MAIN_FLOW_STATE } from './src/app/navigation';
import { useAppNavigation } from './src/app/useAppNavigation';
import { useCurrentProfile } from './src/app/useCurrentProfile';
import { useGuestLoginPrompt } from './src/app/useGuestLoginPrompt';
import { useLocationPermissionRequest } from './src/app/useLocationPermissionRequest';
import { useNativeShareResults, type ShareFailureNotice } from './src/app/useNativeShareResults';
import { useShareAnalyticsFlush } from './src/app/useShareAnalyticsFlush';
import { useSpringAuthFlow } from './src/app/useSpringAuthFlow';
import type { SocialProvider } from './src/lib/auth/social-provider';
import { initSentry, withSentry } from './src/lib/monitoring/sentry';

initSentry();

const GUEST_HISTORY_REELS: HistoryReel[] = [ONBOARDING_HISTORY_REEL];
// 비회원 장소에 게시물이 없을 때 렌더마다 새 배열을 만들지 않도록 고정합니다.
const EMPTY_GUEST_PLACE_REELS: PlaceReel[] = [];
const GUEST_HISTORY_DETAILS = {
  [ONBOARDING_HISTORY_REEL.id]: ONBOARDING_HISTORY_DETAIL,
};
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

configureDataSources();

function App() {
  const posthog = usePostHog();
  useShareAnalyticsFlush();
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
    openLoginFromGuest,
    returnToGuestFlow,
    openGuestMain,
    openMemberMain,
  } = useAppNavigation();
  const {guestPlaces, deleteGuestPlaces, resetGuestPlaces} = useGuestSeedPlaces();
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  const {
    requiredUpdateStoreUrl,
    recommendedUpdate,
    refreshUpdatePolicy,
    dismissRecommendedUpdate,
  } = useAppUpdatePolicy();
  const {isSplashVisible, hasCompletedGuide, completeGuide} = useSplashGate(refreshUpdatePolicy);
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
  } = useSpringAuthFlow({posthog, hasCompletedGuide}, {
    onGuestSession: signedInOnThisInstall => {
      // 로그아웃, 세션 만료, 탈퇴는 모두 여기를 지나므로 이전 회원의 보관함 목록이 다음 회원에게 보이지 않게 비웁니다.
      clearSavedPlacesCache();
      if (signedInOnThisInstall) openLogin();
      else openGuestMain();
      setMyPageOverlay(null);
    },
    onMemberSession: source => {
      // 방금 로그인했으면 이전 회원이나 비회원이 보던 보관함 스크롤 위치를 남기지 않습니다.
      if (source === 'signed-in') savedPlacesScrollOffsetRef.current = 0;
      // 회원이 되면 돌아갈 비회원 흐름(openMemberMain이 비움)과 공유 로그인 표시를 내리고,
      // 비회원이 지운 시드 장소는 다음 비회원 진입 때 시드로 되돌립니다. 로그인 유도는 훅이 스스로 내립니다.
      openMemberMain();
      resetPendingShareLogin();
      resetGuestPlaces();
    },
    onGuestTransferFailed: () => {
      Alert.alert(
        '군자역 게시물을 저장하지 못했어요',
        '연결을 확인해 주세요. 앱을 다시 열면 저장을 재시도할게요.',
      );
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

  // 핸들러는 렌더가 끝난 뒤 비동기로만 불리므로 아래 useGuestLoginPrompt가 돌려주는 dismissGuestLoginPrompt를 써도 안전합니다.
  // isGuestBrowsing이 hasPendingShareLogin을 읽어야 해서 useGuestLoginPrompt를 useNativeShareResults보다 먼저 부를 수 없습니다.
  const {hasPendingShareLogin, cancelPendingShareLogin, resetPendingShareLogin} =
    useNativeShareResults(isAuthReady, {
      onGuestLoginPrompt: () => {
        dismissGuestLoginPrompt();
        setMyPageOverlay(null);
        openLoginFromGuest(GUEST_MAIN_FLOW_STATE);
      },
      onOpenSavedPlaces: reason => {
        if (reason === 'guest-preview') {
          dismissGuestLoginPrompt();
          setMyPageOverlay(null);
        }
        openMainScreen('saved');
      },
      onLoginRequired: openLogin,
      onShareFailed: notice => {
        const {title, message} = SHARE_FAILURE_ALERTS[notice];
        Alert.alert(title, message);
      },
    });

  // 스플래시와 안내가 끝나고 세션이 확인된 메인 흐름입니다. 비회원 로그인 유도와 위치 권한 요청의 공통 전제입니다.
  const isMainVisible =
    isAuthReady && !isSplashVisible && hasCompletedGuide === true && flowState.kind === 'main';
  // 비회원이 메인 화면을 방해 없이 보고 있는 상태입니다. 겹침 화면과 업데이트 안내와 공유 로그인이 없을 때만입니다.
  const isGuestBrowsing =
    isMainVisible &&
    isGuest &&
    !hasPendingShareLogin &&
    myPageOverlay === null &&
    requiredUpdateStoreUrl === null &&
    recommendedUpdate === null;
  // 로그인 화면에서 비회원 둘러보기로 들어갈 수 있는 상태입니다. 돌아갈 흐름이나 공유 로그인이 있으면 그쪽이 먼저입니다.
  const canBrowseAsGuest = isGuest && !guestReturnFlow && !hasPendingShareLogin;

  const {isGuestLoginPromptVisible, dismissGuestLoginPrompt} = useGuestLoginPrompt({
    isGuestBrowsing,
    isMember,
  });

  useLocationPermissionRequest(isMainVisible && !requiredUpdateStoreUrl);

  const handleContinueWithSocial = async (provider: SocialProvider) => {
    // 안내를 마친 비회원이 로그인하면 그때 보관함에 남은 장소를 가입 뒤 옮깁니다.
    const guestTransferPlaces = isGuest && hasCompletedGuide === true ? guestPlaces : null;
    const outcome = await continueWithSocial(provider, guestTransferPlaces);
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

  // 로그아웃 뒤 등 로그인 화면이 첫 화면일 때 비회원 둘러보기로 들어간다.
  const handleBrowseAsGuest = () => {
    clearSocialLoginError();
    openGuestMain();
  };

  const handleContinueBrowsing = () => {
    if (!guestReturnFlow) return;

    cancelGuestTransfer();
    returnToGuestFlow();
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
          guestReels={isGuest ? GUEST_HISTORY_REELS : undefined}
          guestDetails={isGuest ? GUEST_HISTORY_DETAILS : undefined}
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
          onBrowseAsGuest={canBrowseAsGuest ? handleBrowseAsGuest : undefined}
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
            isGuest
              ? 'guest-saved'
              : `member-saved-${memberDataRevision}`
          }
          initialScrollOffset={savedPlacesScrollOffsetRef.current}
          isGuest={isGuest}
          places={isGuest ? guestPlaces : undefined}
          onDeleteGuestPlaces={
            isGuest ? deleteGuestPlaces : undefined
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

    if (currentScreen === 'map') {
      return (
        <MapScreen
          key={
            isGuest
              ? 'guest-map'
              : `member-map-${memberDataRevision}`
          }
          isGuest={isGuest}
          guestPlaces={isGuest ? guestPlaces : undefined}
          onDeleteGuestPlaces={
            isGuest ? deleteGuestPlaces : undefined
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
            isGuest
              ? ONBOARDING_PLACE_REELS[selectedPlace.id] ?? EMPTY_GUEST_PLACE_REELS
              : undefined
          }
          onDeleteGuestPlaces={
            isGuest ? deleteGuestPlaces : undefined
          }
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
          <AppGuideScreen onComplete={completeGuide} />
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
              isGuest={isGuest}
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
