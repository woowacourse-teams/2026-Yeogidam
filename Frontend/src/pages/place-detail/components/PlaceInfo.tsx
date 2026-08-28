import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Place } from '../../../entities/place/types';
import { useCopyToast } from './CopyToast';

type PlaceInfoProps = {
  place: Place;
};

export function PlaceInfo({ place }: PlaceInfoProps) {
  const { showCopyToast } = useCopyToast();

  const copyAddress = () => {
    Clipboard.setString(place.fullAddress);
    showCopyToast('도로명 주소가 복사되었습니다.');
  };

  return (
    <View>
      <View style={styles.summary}>
        <Text style={styles.name}>{place.name}</Text>
        {place.category ? (
          <Text style={styles.category}>{place.category}</Text>
        ) : null}
        <Pressable
          onPress={copyAddress}
          style={({ pressed }) => [
            styles.addressRow,
            pressed && styles.addressPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${place.fullAddress} 주소 복사`}
        >
          <Text style={styles.pin}>●</Text>
          <Text style={styles.address} numberOfLines={1}>
            {place.fullAddress}
          </Text>
          <Text style={styles.copyText}>복사</Text>
        </Pressable>
      </View>
      <Image source={place.image} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 18,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  category: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#66666F',
  },
  addressRow: {
    minHeight: 30,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pin: {
    marginRight: 7,
    fontSize: 9,
    color: '#C2C5CE',
  },
  address: {
    flexShrink: 1,
    fontSize: 14,
    color: '#55555F',
  },
  copyText: {
    marginLeft: 5,
    fontSize: 13,
    fontWeight: '400',
    color: '#5F6FC7',
  },
  addressPressed: {
    opacity: 0.55,
  },
  image: {
    width: '100%',
    height: 190,
    resizeMode: 'cover',
  },
});
