import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {MainScreen} from '../types/navigation';

type BottomTabBarProps = {
  active: MainScreen;
  onNavigate: (screen: MainScreen) => void;
};

export const BOTTOM_TAB_BAR_HEIGHT = 76;

const tabs: {id: MainScreen; icon: 'bookmark' | 'map' | 'person'; label: string}[] = [
  {id: 'saved', icon: 'bookmark', label: '저장됨'},
  {id: 'map', icon: 'map', label: '지도'},
  {id: 'my', icon: 'person', label: '마이'},
];

export function BottomTabBar({active, onNavigate}: BottomTabBarProps) {
  const {bottom} = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, {paddingBottom: bottom}]}>
      {tabs.map(tab => (
        <Pressable
          key={tab.id}
          onPress={() => onNavigate(tab.id)}
          style={styles.tab}>
          <MaterialIcons
            color={active === tab.id ? '#b6c2fb' : '#aeaeb2'}
            name={tab.icon}
            size={22}
          />
          <Text style={[styles.tabText, active === tab.id && styles.activeText]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    minHeight: BOTTOM_TAB_BAR_HEIGHT,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5ea',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  tabText: {
    fontSize: 10,
    color: '#aeaeb2',
  },
  activeText: {
    color: '#b6c2fb',
    fontWeight: '800',
  },
});
