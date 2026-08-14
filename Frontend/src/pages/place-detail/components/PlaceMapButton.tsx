import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';

type PlaceMapButtonProps = {
  url: string;
};

export function PlaceMapButton({ url }: PlaceMapButtonProps) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel="카카오맵으로 바로가기"
    >
      <Text style={styles.icon}>➤</Text>
      <Text style={styles.label}>카카오맵으로 바로가기</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#C1CBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#727BA8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    fontSize: 17,
    color: '#1a1a2e',
    transform: [{ rotate: '-25deg' }],
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
