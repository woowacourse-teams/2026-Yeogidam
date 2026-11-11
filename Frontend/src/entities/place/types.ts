import type { ImageSourcePropType } from 'react-native';

import type { MapProvider } from './mapProvider';

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
  // 카카오 장소는 카카오맵 링크, Google 장소는 구글맵 검색 링크입니다.
  placeUrl?: string;
  // 값이 없으면 카카오 장소로 봅니다.
  mapProvider?: MapProvider;
  // ISO 3166-1 alpha-2 대문자입니다. (KR, JP, FR 등)
  countryCode?: string;
  telephone?: string;
  image?: ImageSourcePropType;
  images?: ImageSourcePropType[];
};
