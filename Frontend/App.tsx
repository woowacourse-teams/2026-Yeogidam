import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  AppState,
  type AppStateStatus,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {configureDataSources} from './src/app/configureDataSources';
import {BottomTabBar} from './src/components/BottomTabBar';
import type {NormalizedAuthError} from './src/lib/auth/errors';
import {
  isAppleSignInSupported,
  signInWithApple,
} from './src/lib/auth/signInWithApple';
import {signInWithGoogle} from './src/lib/auth/signInWithGoogle';
import {signInWithKakao} from './src/lib/auth/signInWithKakao';
import {supabase} from './src/lib/auth/supabase';
import {
  addSharedContentListener,
  getInitialSharedContent,
  type SharedContent,
} from './src/lib/share-intent';
import {EmailLoginScreen} from './src/pages/login/EmailLoginScreen';
import {LoginScreen} from './src/pages/login/LoginScreen';
import {SignUpScreen} from './src/pages/login/SignUpScreen';
import {MapScreen} from './src/pages/map/MapScreen';
import {MyPageScreen} from './src/pages/my-page/MyPageScreen';
import {PlaceDetailScreen} from './src/pages/place-detail/PlaceDetailScreen';
import {SavedPlacesScreen} from './src/pages/saved-places/SavedPlacesScreen';
import {SplashScreen} from './src/pages/splash/SplashScreen';
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
  const [pendingSocialProvider, setPendingSocialProvider] =
    useState<SocialProvider | null>(null);
  const [socialLoginError, setSocialLoginError] =
    useState<NormalizedAuthError | null>(null);
  const [latestSharedContent, setLatestSharedContent] =
    useState<SharedContent | null>(null);
  const [sharedToastMessage, setSharedToastMessage] = useState('');
  const [isSharedToastVisible, setIsSharedToastVisible] = useState(false);
  const sharedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharedToastTranslateY = useRef(new Animated.Value(72)).current;
  const sharedToastOpacity = useRef(new Animated.Value(0)).current;

  const showSharedContentToast = (content: SharedContent) => {
    if (sharedToastTimerRef.current) {
      clearTimeout(sharedToastTimerRef.current);
    }

    setSharedToastMessage(
      content.type === 'url'
        ? '공유된 링크가 저장되었습니다.'
        : '공유된 텍스트가 저장되었습니다.',
    );
    setIsSharedToastVisible(true);
    sharedToastTimerRef.current = setTimeout(() => {
      setIsSharedToastVisible(false);
    }, 1800);
  };

  const syncInitialSharedContent = () => {
    getInitialSharedContent()
      .then(sharedContent => {
        if (!sharedContent) {
          return;
        }

        setLatestSharedContent(sharedContent);
        showSharedContentToast(sharedContent);
      })
      .catch(() => {});
  };

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

    const syncFlowState = async () => {
      const {data, error} = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error || !data.session) {
        setFlowState(INITIAL_FLOW_STATE);
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

    syncFlowState().catch(() => {
      if (!isMounted) {
        return;
      }

      setFlowState(INITIAL_FLOW_STATE);
      setIsAuthReady(true);
    });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setFlowState(INITIAL_FLOW_STATE);
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
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    syncInitialSharedContent();

    const subscription = addSharedContentListener(sharedContent => {
      setLatestSharedContent(sharedContent);
      showSharedContentToast(sharedContent);
    });

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState !== 'active') {
          return;
        }

        syncInitialSharedContent();
      },
    );

    return () => {
      subscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sharedToastTranslateY, {
        toValue: isSharedToastVisible ? 0 : 72,
        duration: isSharedToastVisible ? 180 : 140,
        useNativeDriver: true,
      }),
      Animated.timing(sharedToastOpacity, {
        toValue: isSharedToastVisible ? 1 : 0,
        duration: isSharedToastVisible ? 160 : 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isSharedToastVisible, sharedToastOpacity, sharedToastTranslateY]);

  useEffect(() => {
    return () => {
      if (sharedToastTimerRef.current) {
        clearTimeout(sharedToastTimerRef.current);
      }
    };
  }, []);

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

    const {error} = await supabase.auth.signOut();

    if (!error) {
      return;
    }

    setIsLogoutPending(false);
    Alert.alert('로그아웃 실패', '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.');
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

    return (
      <MyPageScreen
        isLogoutPending={isLogoutPending}
        onLogout={handleLogout}
        onOpenSavedPlaces={() => openMainScreen('saved')}
      />
    );
  };

  const showTabBar =
    flowState.kind === 'main' &&
    flowState.detailSource === null &&
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
          {latestSharedContent ? (
            <View style={styles.sharedDebugCard}>
              <Text style={styles.sharedDebugLabel}>공유 데이터 테스트</Text>
              <Text style={styles.sharedDebugType}>
                타입: {latestSharedContent.type}
              </Text>
              <Text selectable style={styles.sharedDebugValue}>
                {latestSharedContent.value}
              </Text>
            </View>
          ) : null}
          {showTabBar && activeTab ? (
            <BottomTabBar
              active={activeTab}
              onNavigate={openMainScreen}
            />
          ) : null}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sharedToast,
              {
                opacity: sharedToastOpacity,
                transform: [{translateY: sharedToastTranslateY}],
              },
            ]}>
            <Text style={styles.sharedToastText}>{sharedToastMessage}</Text>
          </Animated.View>
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
  sharedDebugCard: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#F0C987',
    zIndex: 30,
    elevation: 30,
  },
  sharedDebugLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A5300',
    marginBottom: 6,
  },
  sharedDebugType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2A2A2A',
    marginBottom: 6,
  },
  sharedDebugValue: {
    fontSize: 13,
    lineHeight: 19,
    color: '#404040',
  },
  sharedToast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1B1B1B',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  sharedToastText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
  },
});

export default App;
