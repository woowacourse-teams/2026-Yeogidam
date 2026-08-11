import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export function PlaceDetailHeader() {
  return (
    <View style={styles.container}>
      <Text style={styles.back}>‹</Text>
      <Text style={styles.heart}>♡</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  heart: {
    fontSize: 30,
    color: '#dbe0f9',
  },
});
