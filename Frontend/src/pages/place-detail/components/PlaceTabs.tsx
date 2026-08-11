import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

const tabs = ['홈', '게시물', '리뷰'];

export function PlaceTabs() {
  return (
    <View style={styles.container}>
      {tabs.map(tab => (
        <Text
          key={tab}
          style={tab === '홈' ? styles.activeTab : styles.inactiveTab}>
          {tab}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  activeTab: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  inactiveTab: {
    fontSize: 14,
    color: '#aeaeb2',
  },
});
