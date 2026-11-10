import React, {type ReactNode} from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {getMiddleCategory} from '../../entities/place/category';

export const PLACE_LIST_ROW_HEIGHT = 116;
const PHOTO_HEIGHT = 92;

type PlaceListRowProps = {
  name: string;
  category?: string | null;
  address: string;
  image?: ImageSourcePropType;
  /** 사진 위에 얹을 표시입니다. 보관함 편집의 선택 표시에 씁니다. */
  photoOverlay?: ReactNode;
  /**
   * 행 오른쪽 끝에 둘 요소입니다. 게시물 상세의 북마크 버튼에 씁니다.
   * 행 버튼 안에 넣으면 iOS 스크린 리더가 행 하나로 합쳐 버튼을 따로 누를 수 없어서, 행 버튼 옆에 둡니다.
   */
  trailing?: ReactNode;
} & Pick<
  PressableProps,
  | 'accessibilityHint'
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'accessibilityValue'
  | 'disabled'
  | 'onLongPress'
  | 'onPress'
  | 'onPressIn'
>;

/** 보관함, 지도, 게시물 상세의 장소 목록이 함께 쓰는 한 줄입니다. */
export function PlaceListRow({
  name,
  category,
  address,
  image,
  photoOverlay,
  trailing,
  ...pressableProps
}: PlaceListRowProps) {
  const {width: windowWidth} = useWindowDimensions();
  const photoWidth = Math.min(104, Math.max(92, windowWidth * 0.25));
  const middleCategory = getMiddleCategory(category);

  return (
    <View style={styles.row}>
      <Pressable
        {...pressableProps}
        style={({pressed}) => [styles.card, pressed && styles.pressed]}>
        <View style={{width: photoWidth}}>
          {image ? (
            <Image source={image} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]} />
          )}
          {photoOverlay}
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            {middleCategory ? (
              <View style={styles.categoryPill}>
                <Text style={styles.category}>{middleCategory}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.address}>{address}</Text>
        </View>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: PLACE_LIST_ROW_HEIGHT,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  card: {
    flex: 1,
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
});
