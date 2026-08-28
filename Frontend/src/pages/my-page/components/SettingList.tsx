import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

type SettingListProps = {
  items: {
    label: string;
    onPress?: () => void;
  }[];
};

export function SettingList({items}: SettingListProps) {
  return (
    <>
      {items.map(item => (
        <Pressable
          key={item.label}
          accessibilityRole={item.onPress ? 'button' : undefined}
          disabled={!item.onPress}
          onPress={item.onPress}
          style={({pressed}) => [
            styles.row,
            item.onPress && pressed && styles.rowPressed,
          ]}>
          <Text style={styles.text}>{item.label}</Text>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 58,
    marginHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPressed: {
    backgroundColor: '#f7f8ff',
  },
  text: {
    fontSize: 15,
    color: '#1a1a2e',
  },
  arrow: {
    fontSize: 25,
    color: '#aeaeb2',
  },
});
