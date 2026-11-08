import React, {useRef} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {getMiddleCategory} from '../../../entities/place/category';
import type {Place} from '../../../entities/place/types';
import {LIBRARY_GUTTER} from './libraryTheme';

type SavedPlaceGridProps = {
  isEditing?: boolean;
  places: Place[];
  onLongPressPlace?: () => void;
  onPressPlace: (place: Place, position: number) => void;
  onTogglePlaceSelection?: (placeId: string) => void;
  selectedPlaceIds?: ReadonlySet<string>;
};

// 지도 화면의 장소 리스트(PlaceResultSheet)와 같은 행 크기입니다.
const ROW_HEIGHT = 116;
const PHOTO_HEIGHT = 92;

/** 보관함의 장소 목록. 지도 화면의 리스트처럼 사진·이름·카테고리·주소를 한 행에 보여 줍니다. */
export function SavedPlaceGrid({
  isEditing = false,
  places,
  onLongPressPlace,
  onPressPlace,
  onTogglePlaceSelection,
  selectedPlaceIds,
}: SavedPlaceGridProps) {
  const didLongPressRef = useRef(false);
  const {width: windowWidth} = useWindowDimensions();
  const photoWidth = Math.min(104, Math.max(92, windowWidth * 0.25));

  return (
    <View style={styles.list}>
      {places.map((place, index) => {
        const selected = selectedPlaceIds?.has(place.id) ?? false;
        const middleCategory = getMiddleCategory(place.category);

        return (
          <View key={`${place.id}-${index}`} style={styles.row}>
            <Pressable
              accessibilityLabel={
                isEditing
                  ? `${place.name} ${selected ? '선택 해제' : '선택'}`
                  : place.name
              }
              accessibilityRole="button"
              onLongPress={() => {
                if (!isEditing) {
                  didLongPressRef.current = true;
                  onLongPressPlace?.();
                }
              }}
              onPress={() => {
                if (didLongPressRef.current) {
                  didLongPressRef.current = false;
                  return;
                }

                if (isEditing) {
                  onTogglePlaceSelection?.(place.id);
                  return;
                }

                onPressPlace(place, index + 1);
              }}
              onPressIn={() => {
                didLongPressRef.current = false;
              }}
              style={({pressed}) => [styles.card, pressed && styles.pressed]}>
              <View style={{width: photoWidth}}>
                {place.image ? (
                  <Image source={place.image} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder]} />
                )}
                {isEditing ? (
                  <View
                    style={[
                      styles.selectionIndicator,
                      selected && styles.selectionIndicatorSelected,
                    ]}>
                    {selected ? (
                      <Text style={styles.selectionCheck}>✓</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View style={styles.text}>
                {middleCategory ? (
                  <View style={styles.titleRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {place.name}
                    </Text>
                    <View style={styles.categoryPill}>
                      <Text style={styles.category}>{middleCategory}</Text>
                    </View>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.name}>
                    {place.name}
                  </Text>
                )}
                <Text style={styles.address}>
                  {place.fullAddress || place.address}
                </Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: LIBRARY_GUTTER,
    paddingBottom: 130,
  },
  row: {
    height: ROW_HEIGHT,
    paddingVertical: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: PHOTO_HEIGHT,
  },
  pressed: {
    opacity: 0.72,
  },
  photo: {
    width: '100%',
    height: PHOTO_HEIGHT,
    borderRadius: 4,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    backgroundColor: '#F1F3FB',
  },
  text: {
    flex: 1,
    paddingLeft: 14,
    paddingTop: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  categoryPill: {
    borderWidth: 1.5,
    borderColor: '#C9C9CE',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 8,
  },
  category: {
    color: '#77777D',
    fontSize: 12,
  },
  address: {
    fontSize: 12,
    color: '#8e8e93',
    lineHeight: 18,
    marginTop: 7,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 6,
    left: 6,
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
});
