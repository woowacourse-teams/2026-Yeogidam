import React, {useRef} from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';

import type {HistoryReel} from '../../../entities/content/types';
import {normalizeReelTitle} from '../../../entities/content/title';
import {PostCard} from '../../place-detail/components/PlacePostGrid';
import {LIBRARY_GRID_GAP, LIBRARY_GUTTER} from './libraryTheme';

type SavedPostGridProps = {
  isEditing?: boolean;
  reels: HistoryReel[];
  onLongPressReel?: () => void;
  onPressReel: (reel: HistoryReel) => void;
  onToggleReelSelection?: (reelId: string) => void;
  selectedReelIds?: ReadonlySet<string>;
};

// 히스토리 화면과 같은 방식으로 캡션에서 제목을 뽑습니다.
function getPostTitle(reel: HistoryReel) {
  return normalizeReelTitle(reel.instagram_description, reel.instagram_title);
}

export function SavedPostGrid({
  isEditing = false,
  reels,
  onLongPressReel,
  onPressReel,
  onToggleReelSelection,
  selectedReelIds,
}: SavedPostGridProps) {
  // 길게 눌러 편집을 시작한 뒤 손을 뗄 때 이어지는 누름은 상세로 넘기지 않습니다.
  const didLongPressRef = useRef(false);
  const {width} = useWindowDimensions();
  const columnWidth = (width - LIBRARY_GUTTER * 2 - LIBRARY_GRID_GAP) / 2;
  const columns = [
    reels.filter((_, index) => index % 2 === 0),
    reels.filter((_, index) => index % 2 === 1),
  ];

  return (
    <View style={styles.grid}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={{width: columnWidth}}>
          {column.map(reel => {
            const title = getPostTitle(reel);
            const selected = selectedReelIds?.has(reel.id) ?? false;
            // 게시물인지 장소인지 구분되도록 종류를 먼저 읽고, 작성자도 '골뱅이' 없이 읽습니다.
            const author = reel.instagram_author_username?.replace(/^@/, '');
            const description = [
              '게시물',
              title,
              author ? `작성자 ${author}` : null,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <PostCard
                key={reel.id}
                accessibilityLabel={
                  isEditing
                    ? `${description}, ${selected ? '선택 해제' : '선택'}`
                    : description
                }
                accessibilityRole="button"
                authorUsername={reel.instagram_author_username}
                imageOverlay={
                  isEditing ? (
                    <View
                      style={[
                        styles.selectionIndicator,
                        selected && styles.selectionIndicatorSelected,
                      ]}>
                      {selected ? <Text style={styles.selectionCheck}>✓</Text> : null}
                    </View>
                  ) : null
                }
                imageWidth={columnWidth}
                onLongPress={() => {
                  if (!isEditing) {
                    didLongPressRef.current = true;
                    onLongPressReel?.();
                  }
                }}
                onPress={() => {
                  if (didLongPressRef.current) {
                    didLongPressRef.current = false;
                    return;
                  }

                  if (isEditing) {
                    onToggleReelSelection?.(reel.id);
                    return;
                  }

                  onPressReel(reel);
                }}
                onPressIn={() => {
                  didLongPressRef.current = false;
                }}
                thumbnailUrl={reel.instagram_thumbnail_url}
                title={title}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: LIBRARY_GUTTER,
    paddingBottom: 130,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorSelected: {
    borderColor: '#7186ed',
    backgroundColor: '#7186ed',
  },
  selectionCheck: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
});
