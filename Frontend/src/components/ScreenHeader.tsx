import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

type ScreenHeaderProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: string;
};

export function ScreenHeader({
  title,
  onBack,
  rightIcon = '⌕',
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable hitSlop={12} onPress={onBack}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
      <Text style={styles.title}>{title}</Text>
      <Pressable style={styles.action}>
        <Text style={styles.actionIcon}>{rightIcon}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 76,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  placeholder: {
    width: 36,
    height: 36,
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  action: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    fontSize: 28,
    color: '#dbe0f9',
  },
});
