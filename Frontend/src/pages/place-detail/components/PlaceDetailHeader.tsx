import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';

type PlaceDetailHeaderProps = {
  onBack: () => void;
  onPressMore?: () => void;
  /** 지정하면 케밥 대신 폴더·삭제 버튼을 보여줍니다. */
  onPressFolder?: () => void;
  onPressDelete?: () => void;
  /** 장소가 하나 이상의 폴더에 담겨 있으면 폴더 버튼을 채워서 보여줍니다. */
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
  isInFolder = false,
  isDeleting = false,
  onInteractivePressIn,
  hideBack = false,
  title,
  titleInHeader = false,
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
      {hideBack ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          hitSlop={12}
          onPressIn={onInteractivePressIn}
          onPress={onBack}
          style={[styles.backButton, compact && styles.compactBackButton]}
        >
          <Text style={[styles.back, compact && styles.compactBack]}>‹</Text>
        </Pressable>
      )}
      {titleInHeader && title ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
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
              onPress={onPressFolder}
              style={[styles.iconButton, isInFolder && styles.iconButtonActive]}
            >
              <MaterialIcons
                color={isInFolder ? '#ffffff' : '#9A9BB0'}
                name={isInFolder ? 'folder' : 'folder-open'}
                size={19}
              />
            </Pressable>
          ) : null}
          {onPressDelete ? (
            <Pressable
              accessibilityLabel="장소 삭제하기"
              accessibilityRole="button"
              disabled={isDeleting}
              hitSlop={6}
              onPressIn={onInteractivePressIn}
              onPress={onPressDelete}
              style={[styles.iconButton, isDeleting && styles.iconButtonDisabled]}
            >
              <MaterialIcons color="#9A9BB0" name="delete-outline" size={20} />
            </Pressable>
          ) : null}
        </View>
      ) : onPressMore ? (
        <Pressable
          accessibilityLabel="더보기"
          accessibilityRole="button"
          hitSlop={8}
          onPressIn={onInteractivePressIn}
          onPress={onPressMore}
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
  title: {
    flex: 1,
    flexShrink: 1,
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
  iconButtonActive: {
    borderColor: '#8FA2FF',
    backgroundColor: '#8FA2FF',
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
