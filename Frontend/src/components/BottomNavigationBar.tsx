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
import Svg, { Path } from 'react-native-svg';
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
              pressed && styles.pressedNavigation,
            ]}
          >
            <View style={styles.navigationInner}>
              {navigation.id === 'my' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 7c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm6 5H6v-.99c.2-.72 3.3-2.01 6-2.01s5.8 1.29 6 2v1z"
                    fill="#666b79"
                  />
                </Svg>
              ) : navigation.id === 'map' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M3.5 5 9 3.2l6 1.9 5.5-1.8v15.4L15 20.8l-6-1.9-5.5 1.8V5ZM9 3.2v15.7m6-13.8v15.7"
                    fill="none"
                    stroke="#666b79"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                  />
                </Svg>
              ) : navigation.id === 'saved' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z"
                    fill="#666b79"
                    stroke="#666b79"
                    strokeWidth={0.3}
                  />
                </Svg>
              ) : navigation.id === 'inBox' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-1 18H5V9h14v11zm1-13H4V4h16v3z"
                    fill="#666b79"
                  />
                  <Path
                    d="M9 12h6v2H9z"
                    fill="none"
                    stroke="#666b79"
                    strokeWidth={1}
                  />
                </Svg>
              ) : (
                <MaterialIcons
                  color={active === navigation.id ? '#1f2238' : '#666b79'}
                  name={navigation.icon}
                  size={active === navigation.id ? 24 : 23}
                />
              )}
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
