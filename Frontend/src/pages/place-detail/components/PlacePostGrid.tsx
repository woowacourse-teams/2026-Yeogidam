import React from 'react';
import {Image, StyleSheet, View} from 'react-native';

import type {Place} from '../../../entities/place/types';

type PlacePostGridProps = {
  places: Place[];
};

export function PlacePostGrid({places}: PlacePostGridProps) {
  return (
    <View style={styles.grid}>
      {Array.from({length: 6}).map((_, index) => (
        <Image
          key={index}
          source={places[index % places.length].image}
          style={styles.image}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  image: {
    width: '48.7%',
    height: 185,
    borderRadius: 12,
    resizeMode: 'cover',
  },
});
