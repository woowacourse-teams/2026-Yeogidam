import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainScreen } from '../types/navigation';

type BottomNavigationBarProps = {
  active: MainScreen;
  onNavigate: (screen: MainScreen) => void;
};

export const BOTTOM_NAVIGATION_BAR_HEIGHT = 64;
export const BOTTOM_NAVIGATION_BAR_SIDE_INSET = 16;
export const BOTTOM_NAVIGATION_BAR_BOTTOM_GAP = 20;
const NAVIGATION_BAR_OVERLAY_FADE_HEIGHT = 60;

export const bottomNavigationBarContainerStyle: ViewStyle = {
  position: 'absolute',
  left: BOTTOM_NAVIGATION_BAR_SIDE_INSET,
  right: BOTTOM_NAVIGATION_BAR_SIDE_INSET,
  minHeight: BOTTOM_NAVIGATION_BAR_HEIGHT,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: '#ffffff',
  shadowColor: '#000000',
  shadowOpacity: 0.09,
  shadowOffset: {
    width: 0,
    height: 8,
  },
  shadowRadius: 20,
  elevation: 10,
};

const navigationItems: {
  id: MainScreen;
  icon: 'bookmark' | 'map' | 'person' | 'inventory-2';
  label: string;
}[] = [
  { id: 'inBox', icon: 'inventory-2', label: '대기함' },
  { id: 'saved', icon: 'bookmark', label: '보관함' },
  { id: 'map', icon: 'map', label: '지도' },
  { id: 'my', icon: 'person', label: '내 정보' },
];

export function BottomNavigationBar({
  active,
  onNavigate,
}: BottomNavigationBarProps) {
  const { bottom } = useSafeAreaInsets();
  const navigationBarBottom = bottom > 0 ? BOTTOM_NAVIGATION_BAR_BOTTOM_GAP : 8;
  const overlayHeight =
    BOTTOM_NAVIGATION_BAR_HEIGHT +
    navigationBarBottom +
    bottom +
    NAVIGATION_BAR_OVERLAY_FADE_HEIGHT;

  return (
    <>
      <LinearGradient
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.14)',
          'rgba(255,255,255,0.75)',
        ]}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.58, 1]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={[styles.overlay, { height: overlayHeight }]}
      />
      <View
        style={[
          styles.navigationBar,
          {
            bottom: navigationBarBottom,
          },
        ]}
      >
        {navigationItems.map(navigation => (
          <Pressable
            key={navigation.id}
            onPress={() => onNavigate(navigation.id)}
            style={({ pressed }) => [
              styles.navigation,
              active === navigation.id && styles.activeNavigation,
              pressed && styles.pressedNavigation,
            ]}
          >
            <View style={styles.navigationInner}>
              <MaterialIcons
                color={active === navigation.id ? '#1f2238' : '#666b79'}
                name={navigation.icon}
                size={active === navigation.id ? 24 : 23}
              />
              <Text
                style={[
                  styles.navigationText,
                  active === navigation.id && styles.activeText,
                ]}
              >
                {navigation.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  navigationBar: {
    ...bottomNavigationBarContainerStyle,
  },
  navigation: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navigationInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeNavigation: {
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  pressedNavigation: {
    opacity: 0.82,
  },
  navigationText: {
    fontSize: 10,
    color: '#666b79',
  },
  activeText: {
    color: '#1f2238',
    fontWeight: '800',
  },
});
