import React, {useState} from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {BottomTabBar} from './src/components/BottomTabBar';
import {HomeScreen} from './src/pages/home/HomeScreen';
import {EmptySavedPlacesScreen} from './src/pages/saved-places/EmptySavedPlacesScreen';
import {SavedPlacesScreen} from './src/pages/saved-places/SavedPlacesScreen';
import {MapScreen} from './src/pages/map/MapScreen';
import {PlaceDetailScreen} from './src/pages/place-detail/PlaceDetailScreen';
import {MyPageScreen} from './src/pages/my-page/MyPageScreen';
import type {MainScreen, Screen} from './src/types/navigation';

function App() {
  const [screen, setScreen] = useState<Screen>('home');

  const renderScreen = () => {
    if (screen === 'home') {
      return <HomeScreen onOpen={setScreen} />;
    }

    if (screen === 'saved') {
      return <SavedPlacesScreen onOpenDetail={() => setScreen('detail')} />;
    }

    if (screen === 'empty') {
      return <EmptySavedPlacesScreen />;
    }

    if (screen === 'map') {
      return <MapScreen onOpenDetail={() => setScreen('detail')} />;
    }

    if (screen === 'detail') {
      return <PlaceDetailScreen />;
    }

    return <MyPageScreen />;
  };

  const showTabBar = screen !== 'home';
  const isMapScreen = screen === 'map';

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
          {showTabBar ? (
            <BottomTabBar
              active={screen as MainScreen}
              onNavigate={setScreen}
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
