import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {configureDataSources} from './src/app/configureDataSources';
import {BottomTabBar} from './src/components/BottomTabBar';
import {
  deleteAccount,
  getLinkedDeletionProviders,
  type AccountDeletionProvider,
  type DeleteAccountRequest,
} from './src/lib/auth/deleteAccount';
import {clearSecureAuthStorage} from './src/lib/auth/authStorage';
import type {NormalizedAuthError} from './src/lib/auth/errors';
import {
  isAppleSignInSupported,
  signInWithApple,
} from './src/lib/auth/signInWithApple';
import {signInWithGoogle} from './src/lib/auth/signInWithGoogle';
import {signInWithKakao} from './src/lib/auth/signInWithKakao';
import {supabase} from './src/lib/auth/supabase';
import {EmailLoginScreen} from './src/pages/login/EmailLoginScreen';
import {LoginScreen} from './src/pages/login/LoginScreen';
import {SignUpScreen} from './src/pages/login/SignUpScreen';
import {MapScreen} from './src/pages/map/MapScreen';
import {AccountDeletionScreen} from './src/pages/my-page/AccountDeletionScreen';
import {ProfileEditScreen} from './src/pages/my-page/ProfileEditScreen';
import {MyPageScreen} from './src/pages/my-page/MyPageScreen';
import {PlaceDetailScreen} from './src/pages/place-detail/PlaceDetailScreen';
import {SavedPlacesScreen} from './src/pages/saved-places/SavedPlacesScreen';
import {SplashScreen} from './src/pages/splash/SplashScreen';
import {getCurrentProfile, updateCurrentProfile} from './src/entities/info/api';
import type {
  ProfileApiError,
  ProfileInfo,
  UpdateCurrentProfileInput,
} from './src/entities/info/types';
import type {Place} from './src/entities/place/types';
import type {
  AppFlowState,
  AuthScreen,
  MainScreen,
  Screen,
} from './src/types/navigation';

const INITIAL_FLOW_STATE: AppFlowState = {
  kind: 'auth',
  stack: ['login'],
};
const SPLASH_MINIMUM_DURATION_MS = 2000;

type SocialProvider = 'apple' | 'kakao' | 'google';

configureDataSources();

function App() {
  const [flowState, setFlowState] = useState<AppFlowState>(INITIAL_FLOW_STATE);
  const [isMapPlaceDetailVisible, setIsMapPlaceDetailVisible] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSplashDelayElapsed, setHasSplashDelayElapsed] = useState(false);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  const [isAccountDeletionVisible, setIsAccountDeletionVisible] = useState(false);
  const [isProfileEditVisible, setIsProfileEditVisible] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<ProfileApiError | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] =
    useState<SocialProvider | null>(null);
  const [socialLoginError, setSocialLoginError] =
    useState<NormalizedAuthError | null>(null);

  const currentScreen: Screen =
    flowState.kind === 'auth'
      ? flowState.stack[flowState.stack.length - 1]
      : flowState.detailSource
        ? 'detail'
        : flowState.activeTab;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setHasSplashDelayElapsed(true);
    }, SPLASH_MINIMUM_DURATION_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  const resetToAuthFlow = useCallback(() => {
    setCurrentProfile(null);
    setProfileError(null);
    setIsProfileLoading(false);
    setLinkedDeletionProviders([]);
    setIsAccountDeletionVisible(false);
    setIsProfileEditVisible(false);
    setFlowState(INITIAL_FLOW_STATE);
    setIsMapPlaceDetailVisible(false);
    setIsLogoutPending(false);
    setPendingSocialProvider(null);
    setIsAuthReady(true);
  }, []);

  const loadCurrentProfile = useCallback(async () => {
    setIsProfileLoading(true);
    setProfileError(null);

    try {
      const profile = await getCurrentProfile();

      setCurrentProfile(profile);
    } catch (nextError) {
      const apiError = nextError as ProfileApiError;

      setCurrentProfile(null);
      setProfileError(apiError);

      if (apiError.errorCode === 'AUTH401_001') {
        resetToAuthFlow();
      }
    } finally {
      setIsProfileLoading(false);
    }
  }, [resetToAuthFlow]);

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
    if (nextScreen !== 'map') {
      setIsMapPlaceDetailVisible(false);
    }

    setIsProfileEditVisible(false);
    setIsAccountDeletionVisible(false);

    setFlowState({
      kind: 'main',
      activeTab: nextScreen,
      detailSource: null,
    });
  };

  const openDetailFrom = (sourceScreen: 'saved' | 'map', place: Place) => {
    setSelectedPlace(place);
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

    const syncFlowState = async () => {
      const {data, error} = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error || !data.session) {
        resetToAuthFlow();
        return;
      }

      setFlowState({
        kind: 'main',
        activeTab: 'saved',
        detailSource: null,
      });
      setLinkedDeletionProviders(getLinkedDeletionProviders(data.session.user));
      setIsAuthReady(true);
      loadCurrentProfile().catch(() => undefined);
    };

    syncFlowState().catch(() => {
      if (isMounted) {
        resetToAuthFlow();
      }
    });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        resetToAuthFlow();
        return;
      }

      setSocialLoginError(null);
      setIsLogoutPending(false);
      setPendingSocialProvider(null);
      setFlowState(current =>
        current.kind === 'main'
          ? current
          : {
              kind: 'main',
              activeTab: 'saved',
              detailSource: null,
            },
      );
      setLinkedDeletionProviders(getLinkedDeletionProviders(session.user));
      loadCurrentProfile().catch(() => undefined);
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadCurrentProfile, resetToAuthFlow]);

  const handleContinueWithSocial = async (provider: SocialProvider) => {
    if (pendingSocialProvider) {
      return;
    }

    setSocialLoginError(null);
    setPendingSocialProvider(provider);

    try {
      if (provider === 'apple') {
        await signInWithApple();
        return;
      }

      if (provider === 'kakao') {
        await signInWithKakao();
        return;
      }

      await signInWithGoogle();
    } catch (error) {
      setSocialLoginError(error as NormalizedAuthError);
      setPendingSocialProvider(null);
    }
  };

  const showPreparingAlert = (featureName: string) => {
    Alert.alert('준비 중', `${featureName} 기능은 아직 준비 중이에요.`);
  };

  const handleOpenTerms = () => {
    showPreparingAlert('약관 동의');
  };

  const handleWithdraw = () => {
    setIsAccountDeletionVisible(true);
  };

  const handleLogout = async () => {
    if (isLogoutPending) {
      return;
    }

    setIsLogoutPending(true);

    const {error} = await supabase.auth.signOut();

    if (!error) {
      return;
    }

    setIsLogoutPending(false);
    Alert.alert('로그아웃 실패', '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.');
  };

  const handleReauthenticate = async () => {
    await handleLogout();
  };

  const handleSaveProfile = async (input: UpdateCurrentProfileInput) => {
    try {
      const nextProfile = await updateCurrentProfile(input);

      setCurrentProfile(nextProfile);
      setProfileError(null);
    } catch (error) {
      const apiError = error as ProfileApiError;

      if (apiError.errorCode === 'AUTH401_001') {
        resetToAuthFlow();
      }

      throw apiError;
    }
  };

  const handleDeleteAccount = async (payload: DeleteAccountRequest) => {
    await deleteAccount(payload);
    await supabase.auth.signOut({scope: 'local'}).catch(() => undefined);
    await clearSecureAuthStorage();
    resetToAuthFlow();
  };

  const renderScreen = () => {
    if (currentScreen === 'login') {
      return (
        <LoginScreen
          isAppleLoginAvailable={isAppleSignInSupported}
          pendingSocialProvider={pendingSocialProvider}
          socialLoginError={socialLoginError}
          onContinueWithApple={() => handleContinueWithSocial('apple')}
          onContinueWithGoogle={() => handleContinueWithSocial('google')}
          onContinueWithKakao={() => handleContinueWithSocial('kakao')}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onOpenSignup={() => pushAuthScreen('signup')}
        />
      );
    }

    if (currentScreen === 'emailLogin') {
      return (
        <EmailLoginScreen
          onBack={popAuthScreen}
          onLogin={() => showPreparingAlert('이메일 로그인')}
          onOpenSignup={() => pushAuthScreen('signup')}
        />
      );
    }

    if (currentScreen === 'signup') {
      return (
        <SignUpScreen
          onBack={popAuthScreen}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onSignUp={() => showPreparingAlert('이메일 회원가입')}
        />
      );
    }

    if (currentScreen === 'saved') {
      return (
        <SavedPlacesScreen
          onAuthenticationRequired={() => setFlowState(INITIAL_FLOW_STATE)}
          onOpenDetail={place => openDetailFrom('saved', place)}
        />
      );
    }

    if (currentScreen === 'map') {
      return (
        <MapScreen onDetailViewChange={setIsMapPlaceDetailVisible} />
      );
    }

    if (currentScreen === 'detail' && selectedPlace) {
      return (
        <PlaceDetailScreen
          onBack={closeDetail}
          onAuthenticationRequired={() => setFlowState(INITIAL_FLOW_STATE)}
          place={selectedPlace}
        />
      );
    }

    if (currentScreen === 'my' && isProfileEditVisible && currentProfile) {
      return (
        <ProfileEditScreen
          onBack={() => setIsProfileEditVisible(false)}
          onSave={handleSaveProfile}
          profile={currentProfile}
        />
      );
    }

    if (currentScreen === 'my' && isAccountDeletionVisible) {
      return (
        <AccountDeletionScreen
          linkedProviders={linkedDeletionProviders}
          onBack={() => setIsAccountDeletionVisible(false)}
          onDeleteAccount={handleDeleteAccount}
        />
      );
    }

    return (
      <MyPageScreen
        currentProfile={currentProfile}
        isLogoutPending={isLogoutPending}
        isProfileLoading={isProfileLoading}
        onOpenEditProfile={() => setIsProfileEditVisible(true)}
        onOpenTerms={handleOpenTerms}
        onLogout={handleLogout}
        onReauthenticate={handleReauthenticate}
        onRetryProfile={loadCurrentProfile}
        onWithdraw={handleWithdraw}
        profileError={profileError}
      />
    );
  };

  const showTabBar =
    flowState.kind === 'main' &&
    flowState.detailSource === null &&
    !isAccountDeletionVisible &&
    !isProfileEditVisible &&
    !(currentScreen === 'map' && isMapPlaceDetailVisible);

  const isMapScreen = currentScreen === 'map';
  const activeTab =
    flowState.kind === 'main' ? flowState.activeTab : undefined;

  if (!isAuthReady || !hasSplashDelayElapsed) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#DBE0F9" />
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={isMapScreen ? ['left', 'right'] : ['top', 'left', 'right']}
        style={styles.safeArea}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={isMapScreen ? 'transparent' : '#ffffff'}
          translucent={isMapScreen}
        />
        <View style={styles.container}>
          {renderScreen()}
          {showTabBar && activeTab ? (
            <BottomTabBar
              active={activeTab}
              onNavigate={openMainScreen}
            />
          ) : null}
        </View>
      </SafeAreaView>
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

export default App;
