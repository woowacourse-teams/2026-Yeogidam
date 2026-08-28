import type { ImageSourcePropType } from 'react-native';

export type Place = {
  id: string;
  savedPlaceId?: string;
  kakaoPlaceId?: string;
  name: string;
  category?: string;
  address: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
  placeUrl?: string;
  telephone?: string;
  image?: ImageSourcePropType;
  images?: ImageSourcePropType[];
};
