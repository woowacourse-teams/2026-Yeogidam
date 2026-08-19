import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import LinearGradient from 'react-native-linear-gradient';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {MainScreen} from '../types/navigation';

type BottomTabBarProps = {
  active: MainScreen;
  onNavigate: (screen: MainScreen) => void;
};

export const BOTTOM_TAB_BAR_HEIGHT = 64;
const TAB_BAR_SIDE_INSET = 16;
const TAB_BAR_BOTTOM_GAP = 20;
const TAB_BAR_OVERLAY_FADE_HEIGHT = 60;

const tabs: {id: MainScreen; icon: 'bookmark' | 'map' | 'person'; label: string}[] = [
  {id: 'saved', icon: 'bookmark', label: '보관함'},
  {id: 'map', icon: 'map', label: '지도'},
  {id: 'my', icon: 'person', label: '내 정보'},
];

export function BottomTabBar({active, onNavigate}: BottomTabBarProps) {
  const {bottom} = useSafeAreaInsets();
  const tabBarBottom = bottom > 0 ? TAB_BAR_BOTTOM_GAP : 8;
  const overlayHeight =
    BOTTOM_TAB_BAR_HEIGHT + tabBarBottom + bottom + TAB_BAR_OVERLAY_FADE_HEIGHT;

  return (
    <>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.75)']}
        end={{x: 0.5, y: 1}}
        locations={[0, 0.58, 1]}
        pointerEvents="none"
        start={{x: 0.5, y: 0}}
        style={[styles.overlay, {height: overlayHeight}]}
      />
      <View
        style={[
          styles.tabBar,
          {
            bottom: tabBarBottom,
          },
        ]}>
        {tabs.map(tab => (
          <Pressable
            key={tab.id}
            onPress={() => onNavigate(tab.id)}
            style={({pressed}) => [
              styles.tab,
              active === tab.id && styles.activeTab,
              pressed && styles.pressedTab,
            ]}>
            <View style={styles.tabInner}>
              <MaterialIcons
                color={active === tab.id ? '#1f2238' : '#666b79'}
                name={tab.icon}
                size={active === tab.id ? 24 : 23}
              />
              <Text style={[styles.tabText, active === tab.id && styles.activeText]}>
                {tab.label}
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
  tabBar: {
    position: 'absolute',
    left: TAB_BAR_SIDE_INSET,
    right: TAB_BAR_SIDE_INSET,
    minHeight: BOTTOM_TAB_BAR_HEIGHT,
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
  },
  tab: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeTab: {
    backgroundColor: 'rgba(0, 0, 0, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  pressedTab: {
    opacity: 0.82,
  },
  tabText: {
    fontSize: 10,
    color: '#666b79',
  },
  activeText: {
    color: '#1f2238',
    fontWeight: '800',
  },
});
