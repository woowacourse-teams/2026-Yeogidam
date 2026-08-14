import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

type PlaceDetailHeaderProps = {
  onBack: () => void;
  topInset?: number;
};

export function PlaceDetailHeader({
  onBack,
  topInset = 0,
}: PlaceDetailHeaderProps) {
  return (
    <View style={[styles.container, {paddingTop: topInset}]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="뒤로 가기"
        hitSlop={12}
        onPress={onBack}>
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 60,
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
  placeholder: {
    width: 46,
    height: 46,
  },
});
