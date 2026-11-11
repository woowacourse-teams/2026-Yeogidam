import React, {useRef} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {PlaceListRow} from '../../../components/place/PlaceListRow';
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

  return (
    <View style={styles.list}>
      {places.map((place, index) => {
        const selected = selectedPlaceIds?.has(place.id) ?? false;
        // 게시물인지 장소인지 구분되도록 종류를 먼저 읽고, 같은 이름을 구분할 카테고리를 함께 읽습니다.
        const category = getMiddleCategory(place.category);
        const description = ['장소', place.name, category]
          .filter(Boolean)
          .join(', ');

        return (
          <PlaceListRow
            key={`${place.id}-${index}`}
            accessibilityLabel={description}
            // 편집 중에는 선택 여부를 값으로 읽고, 두 번 탭이 무엇을 하는지 힌트로 알려 줍니다.
            accessibilityHint={
              isEditing
                ? selected
                  ? '두 번 탭하면 선택을 해제해요'
                  : '두 번 탭하면 북마크를 해제할 장소로 선택해요'
                : undefined
            }
            accessibilityValue={
              isEditing ? {text: selected ? '선택됨' : '선택 안 됨'} : undefined
            }
            accessibilityRole="button"
            address={place.fullAddress || place.address}
            category={place.category}
            image={place.image}
            name={place.name}
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
            photoOverlay={
              isEditing ? (
                <View
                  style={[
                    styles.selectionIndicator,
                    selected && styles.selectionIndicatorSelected,
                  ]}>
                  {selected ? (
                    <Text style={styles.selectionCheck}>✓</Text>
                  ) : null}
                </View>
              ) : null
            }
          />
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
