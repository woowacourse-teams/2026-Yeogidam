import type {Place} from './types';

export const placeMocks: Place[] = [
  {
    id: 'cafe-onwol',
    name: '카페 온월',
    address: '경기도 성남시',
    fullAddress: '서울 성동구 성수이로 88 2층 (성수동)',
    latitude: 37.5448,
    longitude: 127.0557,
    image: require('../../assets/places/place-cafe-onwol.png'),
    images: [
      require('../../assets/places/place-cafe-onwol.png'),
      require('../../assets/places/place-monoroom.png'),
      require('../../assets/places/place-cafe-onwol.png'),
      require('../../assets/places/place-monoroom.png'),
      require('../../assets/places/place-cafe-onwol.png'),
    ],
  },
  {
    id: 'monoroom',
    name: '모노룸 커피',
    address: '서울시 마포구',
    fullAddress: '서울 마포구 동교로 24길 12 1층',
    latitude: 37.5574,
    longitude: 126.9254,
    image: require('../../assets/places/place-monoroom.png'),
    images: [
      require('../../assets/places/place-monoroom.png'),
      require('../../assets/places/place-layer.png'),
      require('../../assets/places/place-monoroom.png'),
      require('../../assets/places/place-layer.png'),
    ],
  },
  {
    id: 'dable',
    name: '서울숲 데이블',
    address: '서울시 성동구',
    fullAddress: '서울 성동구 서울숲길 41 3층',
    latitude: 37.5441,
    longitude: 127.0379,
    image: require('../../assets/places/place-dable.png'),
    images: [
      require('../../assets/places/place-dable.png'),
      require('../../assets/places/place-cafe-onwol.png'),
      require('../../assets/places/place-dable.png'),
      require('../../assets/places/place-cafe-onwol.png'),
    ],
  },
  {
    id: 'layer',
    name: '레이어 커피바',
    address: '서울시 강남구',
    fullAddress: '서울 강남구 도산대로 45길 18',
    latitude: 37.5239,
    longitude: 127.0388,
    image: require('../../assets/places/place-layer.png'),
    images: [
      require('../../assets/places/place-layer.png'),
      require('../../assets/places/place-monoroom.png'),
      require('../../assets/places/place-layer.png'),
      require('../../assets/places/place-monoroom.png'),
    ],
  },
];

export const savedPlaceMocks: Place[] = [
  ...placeMocks,
  ...placeMocks.slice(1, 3),
];
