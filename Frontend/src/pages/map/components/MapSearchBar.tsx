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
  embedded?: boolean;
  topInset?: number;
  onPressBack?: () => void;
};

export const MAP_SEARCH_BAR_HEIGHT = 44;
export const MAP_SEARCH_BAR_TOP_GAP = 12;

export function MapSearchBar({
  value,
  onChangeText,
  embedded = false,
  topInset = 0,
  onPressBack,
}: MapSearchBarProps) {
  return (
    <View
      style={[
        styles.container,
        !embedded && { top: topInset + MAP_SEARCH_BAR_TOP_GAP },
        embedded && styles.embedded,
      ]}
    >
      {onPressBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 화면"
          hitSlop={10}
          onPress={onPressBack}
          style={styles.backButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      ) : null}
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
    left: 24,
    right: 24,
    height: MAP_SEARCH_BAR_HEIGHT,
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
    zIndex: 10,
  },
  embedded: {
    position: 'relative',
    top: undefined,
    left: undefined,
    right: undefined,
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    height: MAP_SEARCH_BAR_HEIGHT,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 17,
    lineHeight: 20,
    textAlignVertical: 'center',
    fontWeight: '800',
    color: '#202124',
  },
  backButton: {
    width: 28,
    height: 36,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    marginTop: -4,
    fontSize: 31,
    lineHeight: 35,
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
