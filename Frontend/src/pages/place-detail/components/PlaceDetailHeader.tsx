import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

import { useScreenAnalytics } from '../../../analytics/uiEvents';
import { focusAccessibility } from '../../../lib/accessibility';

// 화면 전환이 끝난 뒤 장소 이름으로 스크린 리더 포커스를 옮깁니다.
const TITLE_FOCUS_DELAY_MS = 500;

type PlaceDetailHeaderProps = {
  onBack: () => void;
  onPressMore?: () => void;
  /** 지정하면 케밥 대신 폴더·삭제 버튼을 보여줍니다. */
  onPressFolder?: () => void;
  /** 북마크 버튼을 누를 때 호출합니다. isBookmarked에 따라 저장하거나 해제합니다. */
  onPressDelete?: () => void;
  isBookmarked?: boolean;
  /** 장소가 하나 이상의 폴더에 담겨 있으면 폴더 아이콘을 채워서 강조색으로 보여줍니다. */
  isInFolder?: boolean;
  isDeleting?: boolean;
  onInteractivePressIn?: () => void;
  hideBack?: boolean;
  title?: string;
  titleInHeader?: boolean;
  topInset?: number;
  compact?: boolean;
};

export function PlaceDetailHeader({
  onBack,
  onPressMore,
  onPressFolder,
  onPressDelete,
  isBookmarked = true,
  isInFolder = false,
  isDeleting = false,
  onInteractivePressIn,
  hideBack = false,
  title,
  titleInHeader = false,
  topInset = 0,
  compact = false,
}: PlaceDetailHeaderProps) {
  const { button } = useScreenAnalytics();
  const titleRef = useRef<View>(null);
  const hasTitle = titleInHeader && Boolean(title);

  // 들어올 때마다 첫 포커스가 달라지지 않도록 장소 이름부터 읽게 합니다.
  useEffect(() => {
    if (!hasTitle) return undefined;
    return focusAccessibility(titleRef, TITLE_FOCUS_DELAY_MS);
  }, [hasTitle, title]);

  return (
    <View
      style={[
        styles.container,
        compact && styles.compactContainer,
        { paddingTop: topInset },
      ]}
    >
      {hideBack ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={12}
          onPressIn={onInteractivePressIn}
          onPress={() => {
          button('back');
          onBack();
        }}
          style={[styles.backButton, compact && styles.compactBackButton]}
        >
          <Text style={[styles.back, compact && styles.compactBack]}>‹</Text>
        </Pressable>
      )}
      {titleInHeader && title ? (
        // iOS에서 Text는 스스로 VoiceOver 요소가 아니라 포커스 이동 요청을 받지 못합니다.
        // 그래서 View를 하나의 요소로 만들어 머리말·이름을 붙이고, 이 View로 포커스를 옮깁니다.
        <View
          ref={titleRef}
          accessible
          accessibilityLabel={`장소 이름, ${title}`}
          accessibilityRole="header"
          style={styles.titleWrap}
        >
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
      ) : hideBack ? (
        <View style={styles.backPlaceholder} />
      ) : null}
      {onPressFolder || onPressDelete ? (
        <View style={styles.iconActions}>
          {onPressFolder ? (
            <Pressable
              accessibilityLabel={isInFolder ? '폴더 수정' : '폴더에 담기'}
              accessibilityRole="button"
              hitSlop={6}
              onPressIn={onInteractivePressIn}
              onPress={() => {
          button('folder');
          onPressFolder();
        }}
              style={styles.iconButton}
            >
              <MaterialIcons
                color={isInFolder ? '#7186ed' : '#9A9BB0'}
                name={isInFolder ? 'folder' : 'folder-open'}
                size={19}
              />
            </Pressable>
          ) : null}
          {onPressDelete ? (
            <Pressable
              accessibilityLabel={isBookmarked ? '장소 북마크 해제하기' : '장소 북마크하기'}
              accessibilityRole="button"
              accessibilityState={{ selected: isBookmarked }}
              disabled={isDeleting}
              hitSlop={6}
              onPressIn={onInteractivePressIn}
              onPress={() => {
          button(isBookmarked ? 'delete' : 'bookmark');
          onPressDelete();
        }}
              style={[styles.iconButton, isDeleting && styles.iconButtonDisabled]}
            >
              <MaterialIcons
                color={isBookmarked ? '#7186ed' : '#9A9BB0'}
                name={isBookmarked ? 'bookmark' : 'bookmark-border'}
                size={20}
              />
            </Pressable>
          ) : null}
        </View>
      ) : onPressMore ? (
        <Pressable
          accessibilityLabel="더보기"
          accessibilityRole="button"
          hitSlop={8}
          onPressIn={onInteractivePressIn}
          onPress={() => {
          button('more');
          onPressMore();
        }}
          style={[styles.moreButton, compact && styles.compactMoreButton]}
        >
          <MaterialIcons color="#1a1a2e" name="more-vert" size={24} />
        </Pressable>
      ) : (
        <View style={styles.morePlaceholder} />
      )}
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
    backgroundColor: '#ffffff',
  },
  compactContainer: {
    minHeight: 44,
    paddingHorizontal: 24,
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  backButton: {
    width: 38,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactBackButton: {
    width: 44,
    height: 44,
  },
  compactBack: {
    marginTop: -4,
    fontSize: 31,
    lineHeight: 35,
    color: '#202124',
  },
  backPlaceholder: {
    width: 38,
    height: 38,
  },
  titleWrap: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
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
  iconActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E6F5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  morePlaceholder: {
    width: 40,
    height: 40,
  },
  compactMoreButton: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
});
