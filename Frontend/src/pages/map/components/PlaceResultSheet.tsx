import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import type {Place} from '../../../entities/place/types';

type PlaceResultSheetProps = {
  places: Place[];
  onOpenDetail: (place: Place) => void;
};

export function PlaceResultSheet({
  places,
  onOpenDetail,
}: PlaceResultSheetProps) {
  return (
    <View style={styles.sheet}>
      <View style={styles.pill} />
      {places.map(place => (
        <Pressable
          key={place.id}
          onPress={() => onOpenDetail(place)}
          style={styles.result}>
          <View style={styles.resultTop}>
            <View>
              <Text style={styles.name}>{place.name}</Text>
              <Text style={styles.address}>{place.fullAddress}</Text>
            </View>
            <Text style={styles.heart}>♡</Text>
          </View>
          <Image source={place.image} style={styles.image} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 395,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  pill: {
    alignSelf: 'center',
    width: 97,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    opacity: 0.15,
    marginBottom: 12,
  },
  result: {
    paddingVertical: 12,
  },
  resultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  address: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 3,
  },
  heart: {
    fontSize: 28,
    color: '#dbe0f9',
  },
  image: {
    width: '100%',
    height: 108,
    borderRadius: 16,
    resizeMode: 'cover',
  },
});
