import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {DimensionValue, ViewStyle} from 'react-native';

type PlaceMarkerProps = {
  label?: string;
  left: DimensionValue;
  top: DimensionValue;
  selected?: boolean;
};

export function PlaceMarker({
  label,
  left,
  top,
  selected = false,
}: PlaceMarkerProps) {
  const positionStyle: ViewStyle = {left, top};

  if (selected) {
    return (
      <View style={[styles.selectedMarker, positionStyle]}>
        <Text style={styles.selectedLabel}>{label}</Text>
      </View>
    );
  }

  return <View style={[styles.dot, positionStyle]} />;
}

const styles = StyleSheet.create({
  selectedMarker: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 18,
    backgroundColor: '#dbe0f9',
  },
  selectedLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  dot: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7ac7df',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
});
