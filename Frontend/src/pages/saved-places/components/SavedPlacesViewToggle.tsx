import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {LIBRARY_COLORS, LIBRARY_GUTTER} from './libraryTheme';

export type SavedLibraryView = 'places' | 'posts';

type SavedPlacesViewToggleProps = {
  view: SavedLibraryView;
  onChangeView: (view: SavedLibraryView) => void;
  /** 현재 보기의 편집 상태. undefined면 편집 버튼을 그리지 않습니다. */
  isEditing?: boolean;
  onPressEdit?: () => void;
};

const SEGMENTS: {id: SavedLibraryView; label: string}[] = [
  {id: 'posts', label: '게시물'},
  {id: 'places', label: '장소'},
];

export function SavedPlacesViewToggle({
  view,
  onChangeView,
  isEditing,
  onPressEdit,
}: SavedPlacesViewToggleProps) {
  return (
    <View style={styles.row}>
      <View accessibilityRole="tablist" style={styles.track}>
        {SEGMENTS.map(segment => {
          const selected = segment.id === view;
          return (
            <Pressable
              key={segment.id}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              onPress={() => onChangeView(segment.id)}
              style={[styles.segment, selected && styles.segmentSelected]}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {isEditing !== undefined && onPressEdit ? (
        <Pressable
          accessibilityLabel={isEditing ? '보관함 편집 취소' : '보관함 편집'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onPressEdit}
          style={({pressed}) => pressed && styles.pressed}>
          <Text style={styles.editText}>{isEditing ? '취소' : '편집'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIBRARY_GUTTER,
  },
  track: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 16,
    backgroundColor: LIBRARY_COLORS.segmentTrack,
  },
  segment: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 13,
  },
  segmentSelected: {
    backgroundColor: '#ffffff',
    shadowColor: '#1a1a4d',
    shadowOpacity: 0.08,
    shadowOffset: {width: 0, height: 6},
    shadowRadius: 20,
    elevation: 2,
  },
  label: {
    color: LIBRARY_COLORS.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  labelSelected: {
    color: LIBRARY_COLORS.ink,
    fontWeight: '700',
  },
  editText: {
    color: LIBRARY_COLORS.muted,
    fontSize: 14,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
});
