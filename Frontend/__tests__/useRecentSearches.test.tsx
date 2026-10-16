import React, {StrictMode} from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getRecentSearches, setRecentSearches} from '../src/lib/searchHistoryStorage';
import {useRecentSearches} from '../src/pages/saved-places/hooks/useRecentSearches';
import {deferred} from './support/deferred';
import {renderTracked} from './support/renderers';

jest.mock('../src/lib/searchHistoryStorage', () => ({
  getRecentSearches: jest.fn(),
  setRecentSearches: jest.fn(),
}));

let latest: ReturnType<typeof useRecentSearches>;

function Harness() {
  latest = useRecentSearches();
  return null;
}

const act = ReactTestRenderer.act;

/** StrictMode와 동시 루트로 그려, effect와 상태 갱신 함수를 두 번씩 돌려도 저장소에 한 번만 쓰는지 봅니다. */
async function renderInStrictMode() {
  await renderTracked(
    <StrictMode>
      <Harness />
    </StrictMode>,
    {unstable_isConcurrent: true} as unknown as ReactTestRenderer.TestRendererOptions,
  );
}

beforeEach(() => {
  jest.mocked(getRecentSearches).mockReset().mockResolvedValue(['카페']);
  jest.mocked(setRecentSearches).mockReset().mockResolvedValue(undefined);
});

test('저장된 검색어를 읽기만 하면 저장소에 쓰지 않고, 검색어를 저장할 때마다 한 번씩 쓴다', async () => {
  await renderInStrictMode();
  expect(latest.recentSearches).toEqual(['카페']);
  expect(setRecentSearches).not.toHaveBeenCalled();

  await act(async () => latest.saveRecentSearch('빵집'));
  expect(latest.recentSearches).toEqual(['빵집', '카페']);
  expect(setRecentSearches).toHaveBeenCalledTimes(1);
  expect(setRecentSearches).toHaveBeenLastCalledWith(['빵집', '카페']);

  await act(async () => latest.saveRecentSearch('카페'));
  expect(latest.recentSearches).toEqual(['카페', '빵집']);
  expect(setRecentSearches).toHaveBeenCalledTimes(2);
  expect(setRecentSearches).toHaveBeenLastCalledWith(['카페', '빵집']);
});

test('저장소를 다 읽기 전에 저장한 검색어로는 저장된 기록을 덮지 않는다', async () => {
  const stored = deferred<string[]>();
  jest.mocked(getRecentSearches).mockReturnValue(stored.promise);
  await renderInStrictMode();

  await act(async () => latest.saveRecentSearch('빵집'));
  expect(setRecentSearches).not.toHaveBeenCalled();

  await act(async () => stored.resolve(['카페']));
  expect(latest.recentSearches).toEqual(['카페']);
  expect(setRecentSearches).not.toHaveBeenCalled();
});

test('읽은 목록이 아직 그려지기 전에 저장해도 읽은 기록을 지키며 한 번 쓴다', async () => {
  const stored = deferred<string[]>();
  jest.mocked(getRecentSearches).mockReturnValue(stored.promise);
  await renderInStrictMode();

  await act(async () => {
    stored.resolve(['카페']);
    // then 콜백이 돌아 읽은 목록과 저장 가능 표시가 잡히지만, 아직 다시 그리기 전이다.
    await Promise.resolve();
    latest.saveRecentSearch('빵집');
  });

  expect(latest.recentSearches).toEqual(['빵집', '카페']);
  expect(setRecentSearches).toHaveBeenCalledTimes(1);
  expect(setRecentSearches).toHaveBeenLastCalledWith(['빵집', '카페']);
});
