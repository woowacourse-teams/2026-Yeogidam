import React from 'react';
import {
  type FocusEvent,
  Image,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputSubmitEditingEventData,
  type BlurEvent,
  View,
} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

type MapSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  embedded?: boolean;
  topInset?: number;
  onPressBack?: () => void;
  backButtonPosition?: 'inside' | 'leading';
  placeholder?: string;
  autoFocus?: boolean;
  autoCorrect?: boolean;
  onSubmitEditing?: (
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: BlurEvent) => void;
  onPressSearchAction?: () => void;
  /** 기존 호출부 호환용 검색 실행 콜백 */
  onSubmit?: () => void;
};

export const MAP_SEARCH_BAR_HEIGHT = 44;
export const MAP_SEARCH_BAR_TOP_GAP = 12;

export function MapSearchBar({
  value,
  onChangeText,
  embedded = false,
  topInset = 0,
  onPressBack,
  backButtonPosition = 'inside',
  placeholder = '여기담 검색',
  autoFocus = false,
  autoCorrect = true,
  onSubmitEditing,
  onFocus,
  onBlur,
  onPressSearchAction,
  onSubmit,
}: MapSearchBarProps) {
  const handleSearchAction = onPressSearchAction ?? onSubmit;
  const handleSubmitEditing = onSubmitEditing ?? onSubmit;
  const SearchAction = handleSearchAction ? Pressable : View;
  const showLeadingBackButton =
    onPressBack !== undefined && backButtonPosition === 'leading';
  const showInlineBackButton =
    onPressBack !== undefined && backButtonPosition === 'inside';

  return (
    <View
      style={[
        styles.container,
        !embedded && { top: topInset + MAP_SEARCH_BAR_TOP_GAP },
        embedded && styles.embedded,
      ]}
    >
      {showLeadingBackButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="이전 화면"
          hitSlop={10}
          onPress={onPressBack}
          style={styles.leadingBackButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.savedIconButton}>
          <Image
            source={require('../../../assets/icons/brand-mark.png')}
            style={styles.savedIconImage}
          />
        </View>
      )}
      <View style={styles.searchBar}>
        {showInlineBackButton ? (
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
          autoCorrect={autoCorrect}
          autoFocus={autoFocus}
          onBlur={onBlur}
          clearButtonMode="while-editing"
          onChangeText={onChangeText}
          onFocus={onFocus}
          onSubmitEditing={handleSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor="#a9a9ae"
          returnKeyType="search"
          style={styles.input}
          value={value}
        />
        <SearchAction
          {...(handleSearchAction
            ? {
                accessibilityRole: 'button' as const,
                accessibilityLabel: '검색 실행',
                hitSlop: 10,
                onPress: handleSearchAction,
              }
            : {})}
          style={styles.searchAction}
        >
          <MaterialIcons color="#d8dffe" name="search" size={18} />
        </SearchAction>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  searchBar: {
    flex: 1,
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
  savedIconButton: {
    width: MAP_SEARCH_BAR_HEIGHT,
    height: MAP_SEARCH_BAR_HEIGHT,
    borderRadius: MAP_SEARCH_BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadingBackButton: {
    width: MAP_SEARCH_BAR_HEIGHT,
    height: MAP_SEARCH_BAR_HEIGHT,
    borderRadius: MAP_SEARCH_BAR_HEIGHT / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 12,
    elevation: 5,
  },
  savedIconImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
  searchAction: {
    width: 30,
    height: 30,
    marginLeft: 10,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 10,
    elevation: 4,
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
