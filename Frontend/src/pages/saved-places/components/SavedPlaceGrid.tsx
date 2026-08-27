import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import type {Place} from '../../../entities/place/types';

type SavedPlaceGridProps = {
  isEditing?: boolean;
  places: Place[];
  onPressPlace: (place: Place) => void;
  onTogglePlaceSelection?: (placeId: string) => void;
  selectedPlaceIds?: ReadonlySet<string>;
};

export function SavedPlaceGrid({
  isEditing = false,
  places,
  onPressPlace,
  onTogglePlaceSelection,
  selectedPlaceIds,
}: SavedPlaceGridProps) {
  return (
    <View style={styles.grid}>
      {places.map((place, index) => (
        <View key={`${place.id}-${index}`} style={styles.card}>
          <Pressable
            accessibilityLabel={
              isEditing
                ? `${place.name} ${selectedPlaceIds?.has(place.id) ? '선택 해제' : '선택'}`
                : place.name
            }
            accessibilityRole="button"
            onPress={() => {
              if (isEditing) {
                onTogglePlaceSelection?.(place.id);
                return;
              }

              onPressPlace(place);
            }}
            style={styles.cardBody}>
            {place.image ? (
              <Image source={place.image} style={styles.image} />
            ) : (
              <View style={styles.imagePlaceholder} />
            )}
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
            {isEditing ? (
              <View
                style={[
                  styles.selectionIndicator,
                  selectedPlaceIds?.has(place.id) && styles.selectionIndicatorSelected,
                ]}>
                {selectedPlaceIds?.has(place.id) ? (
                  <Text style={styles.selectionCheck}>✓</Text>
                ) : null}
              </View>
            ) : null}
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
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorSelected: {
    borderColor: '#7186ed',
    backgroundColor: '#7186ed',
  },
  selectionCheck: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d8dffe',
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
