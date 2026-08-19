import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type PlaceDetailHeaderProps = {
  onBack: () => void;
  topInset?: number;
  compact?: boolean;
};

export function PlaceDetailHeader({
  onBack,
  topInset = 0,
  compact = false,
}: PlaceDetailHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        compact && styles.compactContainer,
        { paddingTop: topInset },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        hitSlop={12}
        onPress={onBack}
      >
        <Text style={styles.back}>‹</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactContainer: {
    minHeight: 44,
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
});
