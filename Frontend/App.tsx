import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { configureDataSources } from './src/app/configureDataSources';
import { BottomTabBar } from './src/components/BottomTabBar';
import { getCurrentProfile } from './src/entities/info/api';
import type {
  ProfileApiError,
  ProfileInfo,
} from './src/entities/info/types';
import type { Place } from './src/entities/place/types';
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
import { EmailLoginScreen } from './src/pages/login/EmailLoginScreen';
import { LoginScreen } from './src/pages/login/LoginScreen';
import { SignUpScreen } from './src/pages/login/SignUpScreen';
import { MapScreen } from './src/pages/map/MapScreen';
import { AccountDeletionScreen } from './src/pages/my-page/AccountDeletionScreen';
import { MyPageScreen } from './src/pages/my-page/MyPageScreen';
import { TermsAgreementScreen } from './src/pages/my-page/TermsAgreementScreen';
import { PlaceDetailScreen } from './src/pages/place-detail/PlaceDetailScreen';
import { SavedPlacesScreen } from './src/pages/saved-places/SavedPlacesScreen';
import { SplashScreen } from './src/pages/splash/SplashScreen';
import {
  addSharedContentListener,
  getInitialSharedContent,
  type SharedContent,
} from './src/lib/share-intent';
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
const SPLASH_MIN_DURATION_MS = 2000;

type SocialProvider = 'apple' | 'kakao' | 'google';
type MyPageOverlay = 'terms' | 'accountDeletion' | null;

configureDataSources();

function App() {
  const [flowState, setFlowState] = useState<AppFlowState>(INITIAL_FLOW_STATE);
  const [isMapPlaceDetailVisible, setIsMapPlaceDetailVisible] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [pendingSocialProvider, setPendingSocialProvider] =
    useState<SocialProvider | null>(null);
  const [socialLoginError, setSocialLoginError] =
    useState<NormalizedAuthError | null>(null);
  const handledSharedValues = useRef(new Set<string>());
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<ProfileApiError | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);

  const currentScreen: Screen =
    flowState.kind === 'auth'
      ? flowState.stack[flowState.stack.length - 1]
      : flowState.detailSource
      ? 'detail'
      : flowState.activeTab;

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
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const syncFlowState = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error || !data.session) {
        setFlowState(INITIAL_FLOW_STATE);
        setMyPageOverlay(null);
        setIsAuthReady(true);
        return;
      }

      setFlowState({
        kind: 'main',
        activeTab: 'saved',
        detailSource: null,
      });
      setIsAuthReady(true);
    };

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([syncFlowState(), splashDelay]).finally(() => {
      if (!isMounted) {
        return;
      }

      setIsSplashVisible(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setFlowState(INITIAL_FLOW_STATE);
        setMyPageOverlay(null);
        setIsMapPlaceDetailVisible(false);
        setIsLogoutPending(false);
        setPendingSocialProvider(null);
        setIsAuthReady(true);
        return;
      }

      setSocialLoginError(null);
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
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    let isMounted = true;

    const handleSharedContent = async (sharedContent: SharedContent) => {
      const url = sharedContent.value.trim();
      if (!url || handledSharedValues.current.has(url)) {
        return;
      }
      handledSharedValues.current.add(url);

      const {data} = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      if (!data.session) {
        setFlowState(INITIAL_FLOW_STATE);
        Alert.alert('로그인이 필요해요', '공유한 릴스를 저장하려면 로그인해주세요.');
        return;
      }

      setPendingSharedUrl(url);
      openMainScreen('saved');
    };

    const subscription = addSharedContentListener(content => {
      handleSharedContent(content).catch(() => undefined);
    });

    const consumePendingSharedContent = () => {
      getInitialSharedContent()
        .then(content => {
          if (content) {
            handleSharedContent(content).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };

    consumePendingSharedContent();

    const appStateSubscription = AppState.addEventListener(
      'change',
      nextState => {
        if (nextState === 'active') {
          consumePendingSharedContent();
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [isAuthReady]);

  useEffect(() => {
    if (flowState.kind !== 'main') {
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
  }, [flowState.kind]);

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
    setProfileError(null);

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
          onAuthenticationRequired={() => setFlowState(INITIAL_FLOW_STATE)}
          onOpenDetail={place => openDetailFrom('saved', place)}
          onRequireLogin={() => setFlowState(INITIAL_FLOW_STATE)}
          sharedUrl={pendingSharedUrl}
          onSharedUrlHandled={() => {
            if (pendingSharedUrl) {
              handledSharedValues.current.delete(pendingSharedUrl);
            }
            setPendingSharedUrl(null);
          }}
        />
      );
    }

    if (currentScreen === 'map') {
      return <MapScreen onDetailViewChange={setIsMapPlaceDetailVisible} />;
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

    return (
      <MyPageScreen
        currentProfile={currentProfile}
        isProfileLoading={isProfileLoading}
        isLogoutPending={isLogoutPending}
        onOpenContact={openKakaoChannelChat}
        onLogout={handleLogout}
        onOpenTerms={() => pushAuthScreen('terms')}
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
    !(currentScreen === 'map' && isMapPlaceDetailVisible);

  const isMapScreen = currentScreen === 'map';
  const activeTab = flowState.kind === 'main' ? flowState.activeTab : undefined;

  if (!isAuthReady || isSplashVisible) {
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
            <BottomTabBar active={activeTab} onNavigate={openMainScreen} />
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
