import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type PlaceTabEmptyStateProps = {
  message: string;
};

export function PlaceTabEmptyState({ message }: PlaceTabEmptyStateProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/illustrations/dami-looking-around-cropped.png')}
        style={styles.illustration}
      />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 80,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  illustration: {
    width: 92,
    height: 80,
    marginTop: 16,
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
});
