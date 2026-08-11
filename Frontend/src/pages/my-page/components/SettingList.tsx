import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

type SettingListProps = {
  items: string[];
};

export function SettingList({items}: SettingListProps) {
  return (
    <View>
      {items.map(item => (
        <View key={item} style={styles.row}>
          <Text style={styles.text}>{item}</Text>
          <Text style={styles.arrow}>›</Text>
        </View>
      ))}
    </View>
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
  text: {
    fontSize: 15,
    color: '#1a1a2e',
  },
  arrow: {
    fontSize: 25,
    color: '#aeaeb2',
  },
});
