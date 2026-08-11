import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

type MapSearchBarProps = {
  keyword: string;
};

export function MapSearchBar({keyword}: MapSearchBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.back}>‹</Text>
      <Text style={styles.keyword}>{keyword}</Text>
      <Text style={styles.close}>×</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  back: {
    fontSize: 30,
    color: '#1a1a2e',
    marginRight: 12,
  },
  keyword: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  close: {
    fontSize: 26,
    color: '#8e8e93',
  },
});
