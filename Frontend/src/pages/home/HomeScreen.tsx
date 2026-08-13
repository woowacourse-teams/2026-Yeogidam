import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import type {Screen} from '../../types/navigation';

type HomeScreenProps = {
  onOpen: (screen: Exclude<Screen, 'home'>) => void;
};

const screenOptions: {
  id: Exclude<Screen, 'home'>;
  label: string;
  description: string;
}[] = [
  {
    id: 'login',
    label: '로그인',
    description: '이메일 로그인과 소셜 로그인 화면',
  },
  {id: 'saved', label: '저장한 장소', description: '2열 카드 형태의 저장 목록'},
  {
    id: 'empty',
    label: '저장한 장소 (비어 있음)',
    description: '저장 전 안내 화면',
  },
  {id: 'map', label: '지도', description: '검색과 장소 바텀시트'},
  {id: 'detail', label: '장소 상세', description: '사진과 게시물 목록'},
  {id: 'my', label: '마이', description: '내 활동과 설정'},
];

export function HomeScreen({onOpen}: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YEOGIDAM</Text>
        <Text style={styles.title}>마음에 드는 장소를{'\n'}여기 담아보세요.</Text>
        <Text style={styles.description}>
          와이어프레임에 있는 모든 화면을 확인할 수 있어요.
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.menuList}
        showsVerticalScrollIndicator={false}>
        {screenOptions.map(item => (
          <Pressable
            key={item.id}
            onPress={() => onOpen(item.id)}
            style={({pressed}) => [styles.menuCard, pressed && styles.pressed]}>
            <View>
              <Text style={styles.menuTitle}>{item.label}</Text>
              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f3ee',
    paddingHorizontal: 24,
  },
  hero: {
    paddingTop: 64,
    paddingBottom: 36,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7885c8',
    letterSpacing: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 41,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 12,
  },
  description: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 12,
  },
  menuList: {
    gap: 12,
    paddingBottom: 36,
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#1a1a2e',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: {
    opacity: 0.72,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  menuDescription: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 5,
  },
  arrow: {
    fontSize: 30,
    color: '#aeaeb2',
  },
});
