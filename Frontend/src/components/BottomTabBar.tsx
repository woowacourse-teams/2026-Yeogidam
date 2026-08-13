import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {MainScreen} from '../types/navigation';

type BottomTabBarProps = {
  active: MainScreen;
  onNavigate: (screen: MainScreen) => void;
};

const tabs: {id: MainScreen; icon: string; label: string}[] = [
  {id: 'saved', icon: '♧', label: '저장됨'},
  {id: 'map', icon: '♧', label: '지도'},
  {id: 'my', icon: '♙', label: '마이'},
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
          <Text style={[styles.tabIcon, active === tab.id && styles.activeText]}>
            {tab.icon}
          </Text>
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
    minHeight: 68,
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
  tabIcon: {
    fontSize: 20,
    color: '#aeaeb2',
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
