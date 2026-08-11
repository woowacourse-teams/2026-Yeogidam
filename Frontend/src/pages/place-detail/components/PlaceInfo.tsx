import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import type {Place} from '../../../entities/place/types';

type PlaceInfoProps = {
  place: Place;
};

export function PlaceInfo({place}: PlaceInfoProps) {
  return (
    <View>
      <Text style={styles.name}>{place.name}</Text>
      <Text style={styles.address}>{place.fullAddress}</Text>
      <Image source={place.image} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  address: {
    fontSize: 12,
    color: '#8e8e93',
    paddingHorizontal: 24,
    marginTop: 6,
    marginBottom: 18,
  },
  image: {
    width: '100%',
    height: 190,
    resizeMode: 'cover',
  },
});
