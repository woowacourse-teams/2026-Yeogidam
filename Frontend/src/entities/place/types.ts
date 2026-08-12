import type { ImageSourcePropType } from 'react-native';

export type Place = {
  id: string;
  name: string;
  address: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  image: ImageSourcePropType;
  images?: ImageSourcePropType[];
};
