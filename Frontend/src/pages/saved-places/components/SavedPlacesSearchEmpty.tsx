import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

type SavedPlacesSearchEmptyProps = {
  title: string;
};

/** 보관함 검색 결과가 없을 때 그리드 대신 남은 화면을 채우고 가운데에 보여 줍니다. */
export function SavedPlacesSearchEmpty({title}: SavedPlacesSearchEmptyProps) {
  return (
    <View style={styles.content}>
      <Image
        source={require('../../../assets/illustrations/dami-search-no-results-cropped.png')}
        style={styles.image}
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>다른 키워드로 다시 검색해보세요.</Text>
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
  // 원본 비율(828:888)을 유지합니다.
  image: {
    width: 96,
    height: 103,
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#8e8e93',
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: 6,
  },
});
