import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import type {Place} from '../../../entities/place/types';

type SavedPlaceGridProps = {
  places: Place[];
  onPressPlace: (place: Place) => void;
};

export function SavedPlaceGrid({
  places,
  onPressPlace,
}: SavedPlaceGridProps) {
  return (
    <View style={styles.grid}>
      {places.map((place, index) => (
        <Pressable
          key={`${place.id}-${index}`}
          onPress={() => onPressPlace(place)}
          style={styles.card}>
          <Image source={place.image} style={styles.image} />
          <View style={styles.dim} />
          <View style={styles.heart}>
            <Text>♡</Text>
          </View>
          <View style={styles.label}>
            <Text style={styles.name}>{place.name}</Text>
            <Text style={styles.address}>{place.address}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 12,
    paddingBottom: 130,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48.5%',
    height: 248,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#eeeeee',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  dim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: 'rgba(24, 24, 24, 0.38)',
  },
  heart: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  name: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  address: {
    color: '#ffffff',
    fontSize: 10,
    marginTop: 2,
  },
});
