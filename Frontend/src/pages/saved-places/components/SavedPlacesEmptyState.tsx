import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

export function SavedPlacesEmptyState() {
  return (
    <View style={styles.content}>
      <Image
        source={require('../../../assets/illustrations/empty-illustration.png')}
        style={styles.image}
      />
      <Text style={styles.title}>아직 저장된 장소가 없어요</Text>
      <Text style={styles.description}>
        인스타그램 릴스나 유튜브 쇼츠에서{'\n'}
        공유하기를 통해 여기담에 저장해보세요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
    paddingHorizontal: 24,
  },
  image: {
    width: 195,
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
