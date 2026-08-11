import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import {ScreenHeader} from '../../components/ScreenHeader';

export function EmptySavedPlacesScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="저장한 장소" />
      <View style={styles.content}>
        <Image
          source={require('../../assets/illustrations/empty-illustration.png')}
          style={styles.image}
        />
        <Text style={styles.title}>아직 저장된 장소가 없어요</Text>
        <Text style={styles.description}>
          인스타그램 릴스나 유튜브 쇼츠에서{'\n'}
          공유하기를 통해 여기담에 저장해보세요.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
  },
  image: {
    width: 156,
    height: 195,
    borderRadius: 30,
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  description: {
    fontSize: 14,
    color: '#8e8e93',
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 8,
  },
});
