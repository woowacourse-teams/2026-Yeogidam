import React from 'react';
import {
  type FocusEvent,
  Image,
  Keyboard,
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
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

type SearchBarProps = {
  value?: string;
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  layout?: 'overlay' | 'embedded' | 'header';
  topInset?: number;
  /** 오버레이 검색창의 좌우 여백. 기본값은 24입니다. */
  horizontalInset?: number;
  onPressBack?: () => void;
  backButtonPosition?: 'inside' | 'leading';
  placeholder?: string;
  autoFocus?: boolean;
  autoCorrect?: boolean;
  maxLength?: number;
  onSubmitEditing?: (
    event: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) => void;
  onFocus?: (event: FocusEvent) => void;
  onBlur?: (event: BlurEvent) => void;
  onPressSearchAction?: () => void;
  /** 누르는 검색창(onPress)에 확정한 검색어(value)가 있을 때 지우기 버튼을 보여 줍니다. */
  onPressClear?: () => void;
  /** 기존 호출부 호환용 검색 실행 콜백 */
  onSubmit?: () => void;
};

export const SEARCH_BAR_HEIGHT = 44;
export const SEARCH_BAR_TOP_GAP = 20;

export function SearchBar({
  value = '',
  onChangeText,
  onPress,
  layout = 'overlay',
  topInset = 0,
  horizontalInset = 24,
  onPressBack,
  backButtonPosition = 'inside',
  placeholder = '장소, 지역 검색',
  autoFocus = false,
  autoCorrect = true,
  maxLength,
  onSubmitEditing,
  onFocus,
  onBlur,
  onPressSearchAction,
  onPressClear,
  onSubmit,
}: SearchBarProps) {
  const handleSearchAction = onPressSearchAction ?? onSubmit;
  const handleSubmitEditing = onSubmitEditing ?? onSubmit;
  const SearchAction = handleSearchAction && !onPress ? Pressable : View;
  const SearchContainer = onPress ? Pressable : View;
  const showLeadingBackButton =
    onPressBack !== undefined && backButtonPosition === 'leading';
  const showInlineBackButton =
    onPressBack !== undefined && backButtonPosition === 'inside';

  return (
    <View
      style={[
        styles.container,
        layout === 'overlay' && {
          top: topInset + SEARCH_BAR_TOP_GAP,
          left: horizontalInset,
          right: horizontalInset,
        },
        layout === 'embedded' && styles.embedded,
        layout === 'header' && styles.header,
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
            source={require('../assets/icons/brand-mark.png')}
            style={styles.savedIconImage}
          />
        </View>
      )}
      <SearchContainer
        {...(onPress
          ? {
              onPress,
              accessibilityRole: 'button' as const,
              accessibilityLabel: placeholder,
            }
          : {})}
        style={styles.searchBar}
      >
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
        {onPress ? (
          // 눌러서 여는 검색창도 입력창과 같은 TextInput으로 그려, 화면이 바뀔 때 글씨 위치가 어긋나지 않게 합니다.
          <TextInput
            accessible={false}
            editable={false}
            placeholder={placeholder}
            placeholderTextColor="#a9a9ae"
            pointerEvents="none"
            style={[styles.inputText, styles.input, !value && styles.placeholderText]}
            value={value}
          />
        ) : (
          <TextInput
            accessibilityLabel="장소, 지역 검색"
            // VoiceOver의 두 손가락 문지르기(Z) 제스처로 키보드를 내립니다. 빈 곳 탭은 스크린 리더에서 쓸 수 없어요.
            onAccessibilityEscape={Keyboard.dismiss}
            autoCapitalize="none"
            autoCorrect={autoCorrect}
            autoFocus={autoFocus}
            onBlur={onBlur}
            clearButtonMode="while-editing"
            maxLength={maxLength}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onSubmitEditing={handleSubmitEditing}
            placeholder={placeholder}
            placeholderTextColor="#a9a9ae"
            returnKeyType="search"
            style={[styles.inputText, styles.input, !value && styles.placeholderText]}
            value={value}
          />
        )}
        {value &&
        (onPress ? onPressClear : Platform.OS !== 'ios') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색어 지우기"
            hitSlop={10}
            onPress={onPress ? onPressClear : () => onChangeText?.('')}
            style={styles.clearButton}
          >
            <Text style={styles.clearIcon}>×</Text>
          </Pressable>
        ) : null}
        <SearchAction
          {...(handleSearchAction && !onPress
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
      </SearchContainer>
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
    height: SEARCH_BAR_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 8,
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
  header: {
    position: 'relative',
    left: undefined,
    right: undefined,
    height: SEARCH_BAR_HEIGHT + SEARCH_BAR_TOP_GAP * 2,
    paddingHorizontal: 24,
  },
  savedIconButton: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    borderRadius: SEARCH_BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadingBackButton: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    borderRadius: SEARCH_BAR_HEIGHT / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
  savedIconImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  inputText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    color: '#202124',
  },
  // 안내 문구는 입력한 검색어보다 작고 얇게 보여, 좁은 검색창에서도 한 줄에 들어가게 합니다.
  placeholderText: {
    fontSize: 15,
    fontWeight: '500',
  },
  input: {
    height: SEARCH_BAR_HEIGHT,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
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
    shadowOffset: { width: 0, height: 4 },
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
    width: 20,
    height: 20,
    marginLeft: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c6c6ca',
  },
  clearIcon: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 18,
  },
});
