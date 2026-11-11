import type {SavedPlaceListItem} from '../src/entities/info/types';
import type {Place} from '../src/entities/place/types';
import {
  filterPlacesByKeyword,
  isAuthenticationError,
  pickSearchedPlaces,
} from '../src/pages/map/mapSearch';

const place = (savedPlaceId: string, name: string, extra: Partial<Place> = {}) =>
  ({
    id: `place-${savedPlaceId}`,
    savedPlaceId,
    name,
    address: '',
    fullAddress: '',
    ...extra,
  }) as Place;

const result = (id: string) => ({id}) as SavedPlaceListItem;

test('서버 결과 가운데 지도에 보이는 장소만 서버 순서대로 고른다', () => {
  const candidates = [place('1', '성수 카페'), place('2', '성수 빵집'), place('3', '망원 식당')];

  // 4는 서버에는 있지만 지금 폴더·카테고리 조건에 없는 장소입니다.
  const picked = pickSearchedPlaces(candidates, [result('2'), result('4'), result('1')]);

  expect(picked.map(item => item.savedPlaceId)).toEqual(['2', '1']);
});

test('서버 결과가 없으면 빈 목록을 돌려준다', () => {
  expect(pickSearchedPlaces([place('1', '성수 카페')], [])).toEqual([]);
});

test('기기 안 검색은 이름·카테고리·주소에서 대소문자와 공백을 무시하고 찾는다', () => {
  const places = [
    place('1', 'Seongsu Cafe'),
    place('2', '망원 식당', {category: '음식점 > 한식'}),
    place('3', '빵집', {fullAddress: '서울 성동구 성수동1가'}),
  ];

  expect(filterPlacesByKeyword(places, 'seongsucafe').map(item => item.savedPlaceId)).toEqual(['1']);
  expect(filterPlacesByKeyword(places, '한식').map(item => item.savedPlaceId)).toEqual(['2']);
  expect(filterPlacesByKeyword(places, '성동구').map(item => item.savedPlaceId)).toEqual(['3']);
});

test('401과 AUTH401_001을 로그인 만료로 본다', () => {
  expect(isAuthenticationError({status: 401})).toBe(true);
  expect(isAuthenticationError({errorCode: 'AUTH401_001'})).toBe(true);
  expect(isAuthenticationError({status: 404, errorCode: 'COMMON404_001'})).toBe(false);
});
