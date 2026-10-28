import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Place } from '../entities/place/types';

export const ALL_CATEGORY = '전체';
export const CATEGORY_CHIPS_HEIGHT = 34;
export const CATEGORY_CHIPS_TOP_GAP = 8;

export function getPlaceCategory(category?: string | null) {
  if (!category) return undefined;

  const categories = category
    .split('>')
    .map(item => item.trim())
    .filter(Boolean);
  return categories[1] ?? categories[0];
}

// 서버가 정의하는 카테고리 enum 값 전체입니다. 저장된 장소에 해당 카테고리가 없어도
// 항상 모두 노출하며, 장소 데이터에서 칩을 만들지 않습니다.
// 서버 enum 연동 전까지는 임시로 고정한 목록이며, 연동되면 API 응답으로 교체합니다.
// 값은 장소의 카테고리(getPlaceCategory)와 같은 이름으로 매칭합니다.
export const PLACE_CATEGORIES = [
  '카페',
  '디저트',
  '한식',
  '양식',
  '일식',
  '중식',
  '분식',
  '술집',
  '별미',
  '문화/여가',
  '기타',
];

export function filterPlacesByCategory(
  places: Place[],
  selectedCategory: string,
) {
  if (selectedCategory === ALL_CATEGORY) return places;
  return places.filter(
    place => getPlaceCategory(place.category) === selectedCategory,
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

  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {[ALL_CATEGORY, ...categories].map(category => {
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
  content: {
    paddingHorizontal: 24,
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
