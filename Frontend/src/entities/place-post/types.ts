import type { ImageSourcePropType } from 'react-native';

export type SocialPlatform = 'instagram' | 'naver-blog' | 'youtube';

export type PlacePost = {
  id: string;
  placeId: string;
  image: ImageSourcePropType;
  title: string;
  platform: SocialPlatform;
  authorHandle: string;
  sourceUrl?: string;
};
