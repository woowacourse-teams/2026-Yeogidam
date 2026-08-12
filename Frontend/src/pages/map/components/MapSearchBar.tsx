import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type MapSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
};

export function MapSearchBar({ value, onChangeText }: MapSearchBarProps) {
  return (
    <View style={styles.container}>
      <TextInput
        accessibilityLabel="여기담 검색"
        autoCapitalize="none"
        clearButtonMode="while-editing"
        onChangeText={onChangeText}
        placeholder="여기담 검색"
        placeholderTextColor="#a9a9ae"
        returnKeyType="search"
        style={styles.input}
        value={value}
      />
      {Platform.OS !== 'ios' && value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          hitSlop={10}
          onPress={() => onChangeText('')}
          style={styles.clearButton}
        >
          <Text style={styles.clearIcon}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    left: 24,
    right: 24,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 17,
    lineHeight: 20,
    textAlignVertical: 'center',
    fontWeight: '800',
    color: '#202124',
  },
  clearButton: {
    width: 24,
    height: 24,
    marginLeft: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c6c6ca',
  },
  clearIcon: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 20,
  },
});
