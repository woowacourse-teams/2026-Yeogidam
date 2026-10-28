import type { ImageSourcePropType } from 'react-native';

export type Place = {
  id: string;
  savedPlaceId?: string;
  savedAt?: string;
  kakaoPlaceId?: string;
  name: string;
  category?: string;
  categoryCode?: string;
  categoryName?: string;
  // 장소가 담긴 폴더 id입니다. 담은 시각 오름차순이라 마지막이 가장 최근에 담은 폴더입니다.
  folderIds?: string[];
  address: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  placeUrl?: string;
  telephone?: string;
  image?: ImageSourcePropType;
  images?: ImageSourcePropType[];
};
