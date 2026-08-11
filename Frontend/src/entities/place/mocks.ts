import type {Place} from './types';

export const placeMocks: Place[] = [
  {
    id: 'cafe-onwol',
    name: '카페 온월',
    address: '경기도 성남시',
    fullAddress: '서울 성동구 성수이로 88 2층 (성수동)',
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
