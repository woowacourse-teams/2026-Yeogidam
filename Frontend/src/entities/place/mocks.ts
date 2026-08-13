import type { Place } from './types';

export const placeMocks: Place[] = [
  {
    id: 'cafe-onwol',
    kakaoPlaceId: '26338954',
    name: '카카오프렌즈 코엑스점',
    category: '가정,생활 > 문구',
    address: '서울 강남구 삼성동 159',
    fullAddress: '서울 강남구 영동대로 513',
    latitude: 37.51207412593136,
    longitude: 127.05902969025047,
    placeUrl: 'http://place.map.kakao.com/26338954',
    telephone: '02-6002-1880',
    image: require('../../assets/places/place-cafe-onwol.png'),
  },
  {
    id: 'monoroom',
    name: '모노룸 커피',
    address: '서울시 마포구',
    fullAddress: '서울 마포구 동교로 24길 12 1층',
    image: require('../../assets/places/place-monoroom.png'),
  },
  {
    id: 'dable',
    name: '서울숲 데이블',
    address: '서울시 성동구',
    fullAddress: '서울 성동구 서울숲길 41 3층',
    image: require('../../assets/places/place-dable.png'),
  },
  {
    id: 'layer',
    name: '레이어 커피바',
    address: '서울시 강남구',
    fullAddress: '서울 강남구 도산대로 45길 18',
    image: require('../../assets/places/place-layer.png'),
  },
];

export const savedPlaceMocks: Place[] = [
  ...placeMocks,
  ...placeMocks.slice(1, 3),
];
