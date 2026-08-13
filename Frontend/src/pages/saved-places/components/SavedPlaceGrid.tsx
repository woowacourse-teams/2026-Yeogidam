import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

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
        <View key={`${place.id}-${index}`} style={styles.card}>
          <Pressable onPress={() => onPressPlace(place)} style={styles.cardBody}>
            <Image source={place.image} style={styles.image} />
            <LinearGradient
              colors={[
                'rgba(0, 0, 0, 0)',
                'rgba(0, 0, 0, 0.22)',
                'rgba(0, 0, 0, 0.58)',
                'rgba(0, 0, 0, 0.86)',
              ]}
              locations={[0, 0.38, 0.72, 1]}
              pointerEvents="none"
              style={styles.dim}
            />
            <View style={styles.label}>
              <Text style={styles.name}>{place.name}</Text>
              <Text style={styles.address}>{place.address}</Text>
            </View>
          </Pressable>
        </View>
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
  cardBody: {
    flex: 1,
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
    height: 100,
  },
  label: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  name: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  address: {
    color: '#ffffff',
    fontSize: 10,
    marginTop: 2,
  },
});
