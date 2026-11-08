import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

export type SavedPlacesEmptyResultVariant = 'search' | 'category' | 'empty';

// 일러스트마다 원본 비율을 유지하고 높이를 103으로 맞춥니다.
const ILLUSTRATIONS: Record<
  SavedPlacesEmptyResultVariant,
  {source: number; size: {width: number; height: number}}
> = {
  // 검색 결과가 아예 없을 때 (828:888)
  search: {
    source: require('../../../assets/illustrations/dami-search-no-results-cropped.png'),
    size: {width: 96, height: 103},
  },
  // 검색 결과가 고른 카테고리에만 없을 때 (954:804)
  category: {
    source: require('../../../assets/illustrations/dami-empty-category-cropped.png'),
    size: {width: 122, height: 103},
  },
  // 담은 항목이 없을 때 (602:570). 다른 화면이 쓰는 -cropped는 여백이 남아 있어 따로 잘라 둔 파일을 씁니다.
  empty: {
    source: require('../../../assets/illustrations/dami-empty-box-small-tight.png'),
    size: {width: 109, height: 103},
  },
};

type SavedPlacesEmptyResultProps = {
  variant: SavedPlacesEmptyResultVariant;
  title: string;
  description: string;
};

/** 보관함 그리드에 보여 줄 항목이 없을 때 그리드 대신 남은 화면 가운데에 보여 줍니다. */
export function SavedPlacesEmptyResult({
  variant,
  title,
  description,
}: SavedPlacesEmptyResultProps) {
  const {source, size} = ILLUSTRATIONS[variant];
  return (
    <View style={styles.content}>
      <Image source={source} style={[styles.image, size]} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 아래 여백은 그리드와 같이 하단 탭에 가리지 않을 만큼 둡니다.
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 130,
  },
  image: {
    marginBottom: 18,
  },
  // 탭 안의 안내라 화면 전체 빈 상태(20, 800)보다 작고 얇게 둡니다.
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    color: '#8e8e93',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 4,
  },
});
