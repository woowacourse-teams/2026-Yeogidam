import {addRecentSearch} from '../src/pages/saved-places/recentSearches';

const numbered = (count: number) => Array.from({length: count}, (_, index) => `${index + 1}`);

describe('addRecentSearch', () => {
  test('앞뒤 공백을 지운 검색어를 맨 앞에 둔다', () => {
    expect(addRecentSearch(['카페'], '  빵집 ')).toEqual(['빵집', '카페']);
  });

  test('이미 있는 검색어는 하나만 남기고 맨 앞으로 옮긴다', () => {
    expect(addRecentSearch(['1', '2', '3'], ' 2 ')).toEqual(['2', '1', '3']);
  });

  test('9개에 하나를 더하면 10개를 모두 두고, 10개에 하나를 더하면 가장 오래된 검색어를 버린다', () => {
    expect(addRecentSearch(numbered(9), '새')).toEqual(['새', ...numbered(9)]);
    expect(addRecentSearch(numbered(10), '새')).toEqual(['새', ...numbered(9)]);
  });

  test('10개가 찬 목록에서 이미 있는 검색어를 저장하면 버리는 검색어 없이 순서만 바꾼다', () => {
    expect(addRecentSearch(numbered(10), '10')).toEqual(['10', ...numbered(9)]);
  });

  test('빈 검색어와 공백뿐인 검색어는 무시하고 받은 목록을 그대로 돌려준다', () => {
    const searches = ['1'];
    expect(addRecentSearch(searches, '')).toBe(searches);
    expect(addRecentSearch(searches, '   ')).toBe(searches);
  });
});
