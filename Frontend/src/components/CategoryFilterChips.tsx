import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import {
  PLACE_CATEGORY_CODES,
  PLACE_CATEGORY_NAMES,
  resolvePlaceCategoryCode,
} from '../entities/place/category';
import type { Place } from '../entities/place/types';

export const ALL_CATEGORY = '전체';
export const CATEGORY_CHIPS_HEIGHT = 34;
export const CATEGORY_CHIPS_TOP_GAP = 8;
const CHIP_SHADOW_SPACE = 8;

// 칩은 서버 범주 이름으로 그리고, 장소는 범주 코드의 이름과 맞춰 거릅니다.
// 서버 칩 목록 API 연동 전까지는 앱에 고정한 목록을 씁니다.
export const PLACE_CATEGORIES = PLACE_CATEGORY_CODES.map(
  code => PLACE_CATEGORY_NAMES[code],
);

export function filterPlacesByCategory(
  places: Place[],
  selectedCategory: string,
) {
  if (selectedCategory === ALL_CATEGORY) return places;
  return places.filter(
    place =>
      PLACE_CATEGORY_NAMES[resolvePlaceCategoryCode(place)] ===
      selectedCategory,
  );
}

type CategoryFilterChipsProps = {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function CategoryFilterChips({
  categories,
  selectedCategory,
  onSelectCategory,
  style,
}: CategoryFilterChipsProps) {
  if (categories.length === 0) return null;

  const options = [ALL_CATEGORY, ...categories];
  const selectedIndex = Math.max(0, options.indexOf(selectedCategory));

  return (
    // 스크린 리더에서는 칩 묶음을 값을 조절하는 요소 하나로 읽습니다. 칩을 하나씩 다 지나지 않아도 되고,
    // 위아래로 쓸어 카테고리를 바꿉니다. 화면에는 영향이 없어요.
    <View
      accessible
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityHint="위아래로 쓸어 카테고리를 바꿀 수 있어요"
      accessibilityLabel="카테고리 필터"
      accessibilityRole="adjustable"
      accessibilityValue={{ text: options[selectedIndex] }}
      onAccessibilityAction={event => {
        const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
        const next = options[selectedIndex + step];
        if (next !== undefined) onSelectCategory(next);
      }}
      style={[styles.wrapper, style]}
    >
      <ScrollView
        horizontal
        style={styles.scroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {options.map(category => {
          const selected = category === selectedCategory;
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${category} 카테고리`}
              onPress={() => onSelectCategory(category)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.text, selected && styles.textSelected]}>
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: CATEGORY_CHIPS_HEIGHT,
  },
  scroll: {
    flexGrow: 0,
    height: CATEGORY_CHIPS_HEIGHT + CHIP_SHADOW_SPACE * 2,
    marginVertical: -CHIP_SHADOW_SPACE,
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: CHIP_SHADOW_SPACE,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    height: CATEGORY_CHIPS_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: CATEGORY_CHIPS_HEIGHT / 2,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E3E6F5',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  chipSelected: {
    backgroundColor: '#8FA2FF',
    borderColor: '#8FA2FF',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A4F66',
  },
  textSelected: {
    color: '#ffffff',
  },
});
