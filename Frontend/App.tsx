import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  PanResponder,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { configureDataSources } from './src/app/configureDataSources';
import { BottomNavigationBar } from './src/components/BottomNavigationBar';
import { getCurrentProfile } from './src/entities/info/api';
import type { ProfileApiError, ProfileInfo } from './src/entities/info/types';
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
import { InBoxScreen } from './src/pages/inBox/inBoxScreen';
import { AccountDeletionScreen } from './src/pages/my-page/AccountDeletionScreen';
import { MyPageScreen } from './src/pages/my-page/MyPageScreen';
import { TermsAgreementScreen } from './src/pages/my-page/TermsAgreementScreen';
import { PlaceDetailScreen } from './src/pages/place-detail/PlaceDetailScreen';
import { SavedPlacesScreen } from './src/pages/saved-places/SavedPlacesScreen';
import { SplashScreen } from './src/pages/splash/SplashScreen';
import {
  clearShareResult,
  getShareResults,
  syncShareAccessToken,
} from './src/lib/share-intent';
import type {
  AppFlowState,
  AuthScreen,
  MainScreen,
  Screen,
} from './src/types/navigation';
import {
  getSharedSaveState,
  setSharedSaveState,
} from './src/lib/reel-save-state';

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
  const lastHandledShareResultRef = useRef<string | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ProfileInfo | null>(
    null,
  );
  const [profileError, setProfileError] = useState<ProfileApiError | null>(
    null,
  );
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [myPageOverlay, setMyPageOverlay] = useState<MyPageOverlay>(null);
  const [savedPlaces, setSavedPlaces] = useState<Place[] | undefined>(
    undefined,
  );
  const [isSavedPlacesEditing, setIsSavedPlacesEditing] = useState(false);
  const [linkedDeletionProviders, setLinkedDeletionProviders] = useState<
    AccountDeletionProvider[]
  >([]);
  const [isSwipeBackActive, setIsSwipeBackActive] = useState(false);
  const swipeBackTranslation = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

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
        await syncShareAccessToken(null);
        setFlowState(INITIAL_FLOW_STATE);
        setMyPageOverlay(null);
        setSavedPlaces(undefined);
        setIsAuthReady(true);
        return;
      }

      await syncShareAccessToken(data.session.access_token);

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
      void syncShareAccessToken(session?.access_token ?? null);
      if (!isMounted) {
        return;
      }

      if (!session) {
        setFlowState(INITIAL_FLOW_STATE);
        setMyPageOverlay(null);
        setSavedPlaces(undefined);
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

    const consumePendingSharedContent = () => {
      getShareResults()
        .then(results => {
          if (!isMounted) {
            return;
          }
          const currentShareState = getSharedSaveState();
          const activeRequestId =
            currentShareState?.source === 'instagram_share'
              ? currentShareState.shareResultId
              : undefined;
          const result = activeRequestId
            ? results.find(item => item.requestId === activeRequestId) ??
              results[0]
            : results[0];
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
          setSharedSaveState({
            shareResultId: result.requestId,
            url: result.url,
            status: result.status,
            source: 'instagram_share',
            rawSharedText: result.rawSharedText,
            reused: result.reused,
            reel: {
              id: result.reelId ?? `share-${Date.now()}`,
              processing_status: result.status,
              failure_reason: result.failureReason ?? null,
              instagram_thumbnail_url: null,
              created_at: new Date(result.updatedAt).toISOString(),
            },
          });
          openMainScreen('saved');
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
    setSavedPlaces(undefined);

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

  const canSwipeBack =
    myPageOverlay !== null ||
    currentScreen === 'emailLogin' ||
    currentScreen === 'signup' ||
    currentScreen === 'terms' ||
    currentScreen === 'detail';

  const handleSwipeBack = () => {
    if (myPageOverlay !== null) {
      setMyPageOverlay(null);
      return;
    }

    if (currentScreen === 'detail') {
      closeDetail();
      return;
    }

    popAuthScreen();
  };

  const resetSwipeBack = () => {
    Animated.spring(swipeBackTranslation, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start(({ finished }) => {
      if (finished) {
        setIsSwipeBackActive(false);
      }
    });
  };

  const completeSwipeBack = () => {
    Animated.timing(swipeBackTranslation, {
      toValue: screenWidth,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        return;
      }

      handleSwipeBack();
      setIsSwipeBackActive(false);
    });
  };

  useEffect(() => {
    if (!isSwipeBackActive) {
      swipeBackTranslation.setValue(0);
    }
  }, [isSwipeBackActive, swipeBackTranslation]);

  // Start only at the left edge so scrollable content keeps its own gestures.
  const swipeBackResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) =>
      canSwipeBack &&
      gestureState.x0 <= 24 &&
      gestureState.dx > 12 &&
      Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderGrant: () => setIsSwipeBackActive(true),
    onPanResponderMove: (_event, gestureState) => {
      swipeBackTranslation.setValue(
        Math.min(Math.max(gestureState.dx, 0), screenWidth),
      );
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (
        gestureState.dx >= 72 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ) {
        completeSwipeBack();
        return;
      }

      resetSwipeBack();
    },
    onPanResponderTerminate: resetSwipeBack,
  });

  const renderScreen = (
    screen: Screen = currentScreen,
    overlay: MyPageOverlay = myPageOverlay,
  ) => {
    if (overlay === 'terms') {
      return <TermsAgreementScreen onBack={() => setMyPageOverlay(null)} />;
    }

    if (overlay === 'accountDeletion') {
      return (
        <AccountDeletionScreen
          linkedProviders={linkedDeletionProviders}
          onBack={() => setMyPageOverlay(null)}
          onDeleteAccount={handleDeleteAccount}
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
          onAuthenticationRequired={() => {
            setSavedPlaces(undefined);
            setFlowState(INITIAL_FLOW_STATE);
          }}
          onEditModeChange={setIsSavedPlacesEditing}
          onOpenDetail={place => openDetailFrom('saved', place)}
          onPlacesChange={setSavedPlaces}
          onRequireLogin={() => {
            setSavedPlaces(undefined);
            setFlowState(INITIAL_FLOW_STATE);
          }}
          onSharedResultConsumed={clearShareResult}
          onSharedResultDismissed={clearShareResult}
          places={savedPlaces}
        />
      );
    }

    if (screen === 'inBox') {
      return <InBoxScreen />;
    }

    if (screen === 'map') {
      return (
        <MapScreen
          onAuthenticationRequired={() => setFlowState(INITIAL_FLOW_STATE)}
          onDetailViewChange={setIsMapPlaceDetailVisible}
        />
      );
    }

    if (screen === 'detail' && selectedPlace) {
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

  const renderPreviousScreen = () => {
    if (myPageOverlay !== null) {
      return renderScreen('my', null);
    }

    if (currentScreen === 'detail' && flowState.kind === 'main') {
      return renderScreen(flowState.activeTab, null);
    }

    if (flowState.kind === 'auth' && flowState.stack.length > 1) {
      return renderScreen(flowState.stack[flowState.stack.length - 2], null);
    }

    return null;
  };

  const showTabBar =
    flowState.kind === 'main' &&
    flowState.detailSource === null &&
    myPageOverlay === null &&
    !isSavedPlacesEditing &&
    !(currentScreen === 'map' && isMapPlaceDetailVisible);

  const isMapScreen = currentScreen === 'map';
  const activeTab = flowState.kind === 'main' ? flowState.activeTab : undefined;
  const previousMainScreen =
    canSwipeBack && flowState.kind === 'main'
      ? flowState.activeTab
      : undefined;
  const showPreviousTabBar =
    previousMainScreen !== undefined &&
    !isSavedPlacesEditing &&
    !(previousMainScreen === 'map' && isMapPlaceDetailVisible);

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
        <View style={styles.container} {...swipeBackResponder.panHandlers}>
          <View pointerEvents={canSwipeBack ? 'none' : 'auto'} style={styles.screen}>
            {canSwipeBack ? renderPreviousScreen() : renderScreen()}
          </View>
          {canSwipeBack && showPreviousTabBar ? (
            <View pointerEvents="none">
              <BottomNavigationBar
                active={previousMainScreen}
                onNavigate={openMainScreen}
              />
            </View>
          ) : null}
          {!canSwipeBack && showTabBar && activeTab ? (
            <BottomNavigationBar active={activeTab} onNavigate={openMainScreen} />
          ) : null}
          {canSwipeBack ? (
            <Animated.View
              style={[
                styles.outgoingScreen,
                isSwipeBackActive
                  ? { transform: [{ translateX: swipeBackTranslation }] }
                  : undefined,
              ]}
            >
              {renderScreen()}
            </Animated.View>
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
  screen: {
    flex: 1,
  },
  outgoingScreen: {
    ...StyleSheet.absoluteFill,
  },
});

export default App;
