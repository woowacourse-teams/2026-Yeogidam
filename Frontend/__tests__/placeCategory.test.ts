import {
  resolvePlaceCategoryCode,
  toPlaceCategoryCode,
} from '../src/entities/place/category';
import {filterPlacesByCategory} from '../src/components/CategoryFilterChips';
import type {Place} from '../src/entities/place/types';

describe('toPlaceCategoryCode', () => {
  test.each([
    ['음식점 > 카페 > 커피전문점', 'CAFE'],
    ['음식점 > 카페 > 바나프레소', 'CAFE'],
    ['음식점 > 간식 > 제과,베이커리', 'DESSERT'],
    ['음식점 > 한식 > 육류,고기', 'KOREAN'],
    ['음식점 > 양식 > 햄버거', 'WESTERN'],
    ['음식점 > 일식 > 초밥,롤', 'JAPANESE'],
    ['음식점 > 중식', 'CHINESE'],
    ['음식점 > 분식', 'BUNSIK'],
    ['음식점 > 술집 > 호프,요리주점', 'BAR'],
    ['음식점 > 패스트푸드', 'SPECIALTY'],
    ['음식점 > 뷔페 > 한식뷔페', 'SPECIALTY'],
    ['음식점 > 퓨전요리 > 퓨전일식', 'SPECIALTY'],
    ['한식', 'KOREAN'],
    ['간식', 'DESSERT'],
    ['문화,예술 > 미술관', 'CULTURE_LEISURE'],
    ['여행 > 관광,명소', 'CULTURE_LEISURE'],
    ['가정,생활 > 문구,사무용품', 'CULTURE_LEISURE'],
    ['교육,학문 > 학습시설 > 도서관', 'CULTURE_LEISURE'],
    ['이슈 > 이벤트', 'CULTURE_LEISURE'],
    ['음식점', 'ETC'],
    ['해물,생선', 'ETC'],
    ['돈까스,우동', 'ETC'],
    ['가정,생활 > 미용', 'ETC'],
    ['교육,학문 > 학습시설 > 독서실', 'ETC'],
    ['교통,수송 > 교차로', 'ETC'],
    [undefined, 'ETC'],
  ])('%s → %s', (category, code) => {
    expect(toPlaceCategoryCode(category)).toBe(code);
  });
});

describe('resolvePlaceCategoryCode', () => {
  test('uses the server code when present', () => {
    expect(
      resolvePlaceCategoryCode({
        category: '음식점 > 카페',
        categoryCode: 'ETC',
      }),
    ).toBe('ETC');
  });

  test('falls back to the raw category for missing or unknown codes', () => {
    expect(resolvePlaceCategoryCode({category: '음식점 > 간식'})).toBe(
      'DESSERT',
    );
    expect(
      resolvePlaceCategoryCode({
        category: '음식점 > 간식',
        categoryCode: 'UNKNOWN',
      }),
    ).toBe('DESSERT');
  });
});

describe('filterPlacesByCategory', () => {
  const place = (id: string, category: string): Place => ({
    id,
    name: id,
    category,
    address: '',
    fullAddress: '',
  });
  const places = [
    place('cake', '음식점 > 간식 > 제과,베이커리'),
    place('museum', '문화,예술 > 박물관'),
    place('chicken', '음식점 > 치킨'),
  ];

  test('matches chips by category name instead of the raw segment', () => {
    expect(filterPlacesByCategory(places, '디저트').map(p => p.id)).toEqual([
      'cake',
    ]);
    expect(filterPlacesByCategory(places, '문화/여가').map(p => p.id)).toEqual(
      ['museum'],
    );
    expect(filterPlacesByCategory(places, '별미').map(p => p.id)).toEqual([
      'chicken',
    ]);
    expect(filterPlacesByCategory(places, '전체')).toHaveLength(3);
  });
});
