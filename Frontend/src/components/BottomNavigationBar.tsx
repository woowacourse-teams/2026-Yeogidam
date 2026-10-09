import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainScreen } from '../types/navigation';

type BottomNavigationBarProps = {
  active: MainScreen;
  onNavigate: (screen: MainScreen) => void;
};

export const BOTTOM_NAVIGATION_BAR_HEIGHT = 64;

export function getBottomNavigationBarOffset(bottomInset: number) {
  return bottomInset;
}

export const bottomNavigationBarContainerStyle: ViewStyle = {
  position: 'absolute',
  left: 16,
  right: 16,
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

  return (
    <View
      style={[
        styles.navigationBar,
        {
          bottom: 0,
          paddingBottom: bottom,
        },
      ]}
    >
      {Platform.OS === 'android' && bottom > 0 ? (
        <LinearGradient
          colors={[
            'rgba(31, 34, 56, 0.08)',
            'rgba(31, 34, 56, 0.24)',
            'rgba(31, 34, 56, 0.42)',
          ]}
          end={{ x: 0.5, y: 1 }}
          locations={[0, 0.52, 1]}
          start={{ x: 0.5, y: 0 }}
          style={[styles.systemNavigationGradient, { top: BOTTOM_NAVIGATION_BAR_HEIGHT }]}
        />
      ) : null}
      <View style={styles.navigationItems}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  navigationBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
  },
  navigationItems: {
    height: BOTTOM_NAVIGATION_BAR_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 1.5,
    borderTopColor: '#d9dbe0',
    backgroundColor: '#ffffff',
  },
  systemNavigationGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
