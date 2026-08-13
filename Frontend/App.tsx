import React, {useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {BottomTabBar} from './src/components/BottomTabBar';
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

  const renderScreen = () => {
    if (currentScreen === 'login') {
      return (
        <LoginScreen
          onContinue={() => openMainScreen('saved')}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onOpenSignup={() => pushAuthScreen('signup')}
        />
      );
    }

    if (currentScreen === 'emailLogin') {
      return (
        <EmailLoginScreen
          onBack={popAuthScreen}
          onLogin={() => openMainScreen('saved')}
          onOpenSignup={() => pushAuthScreen('signup')}
        />
      );
    }

    if (currentScreen === 'signup') {
      return (
        <SignUpScreen
          onBack={popAuthScreen}
          onOpenEmailLogin={() => pushAuthScreen('emailLogin')}
          onSignUp={() => openMainScreen('saved')}
        />
      );
    }

    if (currentScreen === 'saved') {
      return <SavedPlacesScreen onOpenDetail={() => openDetailFrom('saved')} />;
    }

    if (currentScreen === 'map') {
      return <MapScreen onOpenDetail={() => openDetailFrom('map')} />;
    }

    if (currentScreen === 'detail') {
      return <PlaceDetailScreen onBack={closeDetail} />;
    }

    return <MyPageScreen onOpenSavedPlaces={() => openMainScreen('saved')} />;
  };

  const showTabBar =
    flowState.kind === 'main' && flowState.detailSource === null;

  const isMapScreen = currentScreen === 'map';
  const activeTab =
    flowState.kind === 'main' ? flowState.activeTab : undefined;

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={isMapScreen ? ['left', 'right', 'bottom'] : undefined}
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
