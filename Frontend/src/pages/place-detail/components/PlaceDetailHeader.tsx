import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

type PlaceDetailHeaderProps = {
  onBack: () => void;
  onPressMore?: () => void;
  topInset?: number;
  compact?: boolean;
};

export function PlaceDetailHeader({
  onBack,
  onPressMore,
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
      <Pressable
        accessibilityLabel="더보기"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPressMore}
        style={styles.moreButton}
      >
        <MaterialIcons color="#1a1a2e" name="more-vert" size={24} />
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
  moreButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 10,
    elevation: 4,
  },
});
