import React, {useRef} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import type {HistoryReel} from '../../../entities/content/types';
import {normalizeReelTitle} from '../../../entities/content/title';
import {
  getPlaceholderGradient,
  LIBRARY_GRID_GAP,
  LIBRARY_GUTTER,
} from './libraryTheme';

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
  const cardWidth = (width - LIBRARY_GUTTER * 2 - LIBRARY_GRID_GAP) / 2;

  return (
    <View style={styles.grid}>
      {reels.map((reel, index) => {
        const [from, to] = getPlaceholderGradient(index);
        const title = getPostTitle(reel);
        const selected = selectedReelIds?.has(reel.id) ?? false;

        return (
          <Pressable
            key={reel.id}
            accessibilityLabel={
              isEditing ? `${title} ${selected ? '선택 해제' : '선택'}` : title
            }
            accessibilityRole="button"
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
            style={[styles.card, {width: cardWidth}]}>
            {reel.instagram_thumbnail_url ? (
              <Image
                source={{uri: reel.instagram_thumbnail_url}}
                style={styles.image}
              />
            ) : (
              <LinearGradient
                colors={[from, to]}
                end={{x: 1, y: 1}}
                start={{x: 0, y: 0}}
                style={styles.image}
              />
            )}
            <LinearGradient
              colors={['rgba(0, 0, 0, 0)', 'rgba(13, 13, 31, 0.62)']}
              pointerEvents="none"
              style={styles.shade}
            />
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            {reel.extracted_place_count != null ? (
              <View
                accessibilityLabel={`추출된 장소 ${reel.extracted_place_count}곳`}
                style={styles.placeCountBadge}>
                <MaterialIcons color="#1a1a2e" name="place" size={14} />
                <Text style={styles.placeCountText}>{reel.extracted_place_count}</Text>
              </View>
            ) : null}
            {isEditing ? (
              <View
                style={[
                  styles.selectionIndicator,
                  selected && styles.selectionIndicatorSelected,
                ]}>
                {selected ? <Text style={styles.selectionCheck}>✓</Text> : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: LIBRARY_GRID_GAP,
    paddingHorizontal: LIBRARY_GUTTER,
    paddingBottom: 130,
  },
  card: {
    height: 214,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#eef0fb',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
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
  placeCountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 40,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  placeCountText: {
    color: '#1a1a2e',
    fontSize: 12,
    fontWeight: '700',
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
  title: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
});
