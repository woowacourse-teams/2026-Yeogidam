import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {BottomTabBar} from './src/components/BottomTabBar';
import type {NormalizedAuthError} from './src/lib/auth/errors';
import {signInWithKakao} from './src/lib/auth/signInWithKakao';
import {supabase} from './src/lib/auth/supabase';
import {EmailLoginScreen} from './src/pages/login/EmailLoginScreen';
import {LoginScreen} from './src/pages/login/LoginScreen';
import {SignUpScreen} from './src/pages/login/SignUpScreen';
import {MapScreen} from './src/pages/map/MapScreen';
import {MyPageScreen} from './src/pages/my-page/MyPageScreen';
import {PlaceDetailScreen} from './src/pages/place-detail/PlaceDetailScreen';
import {SavedPlacesScreen} from './src/pages/saved-places/SavedPlacesScreen';
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

function App() {
  const [flowState, setFlowState] = useState<AppFlowState>(INITIAL_FLOW_STATE);
  const [isMapPlaceDetailVisible, setIsMapPlaceDetailVisible] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isKakaoLoginPending, setIsKakaoLoginPending] = useState(false);
  const [kakaoLoginError, setKakaoLoginError] =
    useState<NormalizedAuthError | null>(null);

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

  const openDetailFrom = (sourceScreen: 'saved' | 'map') => {
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
        setIsKakaoLoginPending(false);
        setIsAuthReady(true);
        return;
      }

      setKakaoLoginError(null);
      setIsKakaoLoginPending(false);
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

  const handleContinueWithKakao = async () => {
    if (isKakaoLoginPending) {
      return;
    }

    setKakaoLoginError(null);
    setIsKakaoLoginPending(true);

    try {
      await signInWithKakao();
    } catch (error) {
      setKakaoLoginError(error as NormalizedAuthError);
      setIsKakaoLoginPending(false);
    }
  };

  const showPreparingAlert = (featureName: string) => {
    Alert.alert('준비 중', `${featureName} 기능은 아직 준비 중이에요.`);
  };

  const renderScreen = () => {
    if (currentScreen === 'login') {
      return (
        <LoginScreen
          isKakaoLoginPending={isKakaoLoginPending}
          kakaoLoginError={kakaoLoginError}
          onContinueWithKakao={handleContinueWithKakao}
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
      return <SavedPlacesScreen onOpenDetail={() => openDetailFrom('saved')} />;
    }

    if (currentScreen === 'map') {
      return (
        <MapScreen onDetailViewChange={setIsMapPlaceDetailVisible} />
      );
    }

    if (currentScreen === 'detail') {
      return <PlaceDetailScreen onBack={closeDetail} />;
    }

    return <MyPageScreen onOpenSavedPlaces={() => openMainScreen('saved')} />;
  };

  const showTabBar =
    flowState.kind === 'main' &&
    flowState.detailSource === null &&
    !(currentScreen === 'map' && isMapPlaceDetailVisible);

  const isMapScreen = currentScreen === 'map';
  const activeTab =
    flowState.kind === 'main' ? flowState.activeTab : undefined;

  if (!isAuthReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#121212" size="large" />
            <Text style={styles.loadingText}>로그인 상태를 확인하고 있어요.</Text>
          </View>
        </SafeAreaView>
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
