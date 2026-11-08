import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {searchSavedMedia} from '../src/entities/content/saved-media-api';
import {searchSavedPlaces} from '../src/entities/info/api';
import type {Place} from '../src/entities/place/types';
import {useSavedLibrarySearch} from '../src/pages/saved-places/useSavedLibrarySearch';

jest.mock('../src/entities/info/api', () => ({searchSavedPlaces: jest.fn()}));
jest.mock('../src/entities/content/saved-media-api', () => ({searchSavedMedia: jest.fn()}));
jest.mock('../src/entities/place/api', () => ({
  toSavedPlaceDisplayPlace: (item: {id: string; place: {name: string}}) => ({
    id: item.id,
    savedPlaceId: item.id,
    name: item.place.name,
    address: '',
    fullAddress: '',
  }),
}));

const mockSearchSavedPlaces = searchSavedPlaces as jest.Mock;
const mockSearchSavedMedia = searchSavedMedia as jest.Mock;

const localPlaces = [
  {id: 'p1', name: '성수 카페', address: '성수동', fullAddress: '서울 성동구 성수동'},
  {id: 'p2', name: '망원 식당', address: '망원동', fullAddress: '서울 마포구 망원동'},
] as Place[];

type Search = ReturnType<typeof useSavedLibrarySearch>;

async function renderSearch(isGuest = false, onAuthenticationRequired?: () => void) {
  const result: {current: Search} = {current: null as never};
  function Harness() {
    result.current = useSavedLibrarySearch({
      places: localPlaces,
      isGuest,
      onAuthenticationRequired,
    });
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<Harness />);
  });
  return result;
}

const reel = (id: string) => ({id, created_at: '2026-11-04T00:00:00Z'});

beforeEach(() => {
  mockSearchSavedPlaces.mockReset();
  mockSearchSavedMedia.mockReset();
});

test('장소와 게시물 캡션을 함께 검색하고 결과 수를 돌려준다', async () => {
  mockSearchSavedPlaces.mockResolvedValue([{id: '7', place: {name: '성수 카페'}}]);
  mockSearchSavedMedia.mockResolvedValue({
    reels: [reel('81'), reel('82')],
    nextCursor: {created_at: '2026-11-04T00:00:00Z', id: '82'},
  });
  const search = await renderSearch();

  let counts: Awaited<ReturnType<Search['search']>> = null;
  await ReactTestRenderer.act(async () => {
    counts = await search.current.search('성수');
  });

  expect(mockSearchSavedPlaces).toHaveBeenCalledWith('성수');
  expect(mockSearchSavedMedia).toHaveBeenCalledWith('성수', undefined);
  expect(counts).toEqual({placeCount: 1, reelCount: 2});
  expect(search.current.query).toBe('성수');
  expect(search.current.places.map(place => place.name)).toEqual(['성수 카페']);
  expect(search.current.reels.map(item => item.id)).toEqual(['81', '82']);
});

test('다음 게시물 페이지는 같은 검색어와 커서로 이어 붙인다', async () => {
  mockSearchSavedPlaces.mockResolvedValue([]);
  mockSearchSavedMedia
    .mockResolvedValueOnce({
      reels: [reel('81')],
      nextCursor: {created_at: '2026-11-04T00:00:00Z', id: '81'},
    })
    .mockResolvedValueOnce({reels: [reel('81'), reel('80')], nextCursor: null});
  const search = await renderSearch();

  await ReactTestRenderer.act(async () => {
    await search.current.search('카페');
  });
  await ReactTestRenderer.act(async () => {
    search.current.loadMoreReels();
  });

  expect(mockSearchSavedMedia).toHaveBeenLastCalledWith('카페', {
    created_at: '2026-11-04T00:00:00Z',
    id: '81',
  });
  expect(search.current.reels.map(item => item.id)).toEqual(['81', '80']);
  expect(search.current.reelCursor).toBeNull();
});

test('검색어가 바뀌면 이전 검색의 늦은 응답은 버린다', async () => {
  let resolveFirst!: (value: unknown) => void;
  mockSearchSavedPlaces
    .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce([{id: '9', place: {name: '망원 식당'}}]);
  mockSearchSavedMedia.mockResolvedValue({reels: [], nextCursor: null});
  const search = await renderSearch();

  let firstCounts: Awaited<ReturnType<Search['search']>> | undefined;
  await ReactTestRenderer.act(async () => {
    const first = search.current.search('성수').then(value => { firstCounts = value; });
    await search.current.search('망원');
    resolveFirst([{id: '7', place: {name: '성수 카페'}}]);
    await first;
  });

  expect(firstCounts).toBeNull();
  expect(search.current.query).toBe('망원');
  expect(search.current.places.map(place => place.name)).toEqual(['망원 식당']);
});

test('로그인이 만료돼 검색하지 못하면 로그인 요청을 알리고 오류 문구를 남긴다', async () => {
  const authError = {status: 401, errorCode: 'AUTH401_001', message: '로그인이 필요해요.'};
  mockSearchSavedPlaces.mockRejectedValue(authError);
  mockSearchSavedMedia.mockRejectedValue(authError);
  const onAuthenticationRequired = jest.fn();
  const search = await renderSearch(false, onAuthenticationRequired);

  await ReactTestRenderer.act(async () => {
    await search.current.search('성수');
  });

  expect(onAuthenticationRequired).toHaveBeenCalled();
  expect(search.current.placeError).toBe('로그인이 필요해요.');
  expect(search.current.reelError).toBe('로그인이 필요해요.');
});

test('게스트는 서버를 부르지 않고 기기 안의 장소를 이름·주소로 거른다', async () => {
  const search = await renderSearch(true);

  await ReactTestRenderer.act(async () => {
    await search.current.search('마포');
  });

  expect(mockSearchSavedPlaces).not.toHaveBeenCalled();
  expect(mockSearchSavedMedia).not.toHaveBeenCalled();
  expect(search.current.places.map(place => place.id)).toEqual(['p2']);
});

test('삭제한 항목은 결과에서 빼고, 검색을 지우면 처음 상태로 돌아간다', async () => {
  mockSearchSavedPlaces.mockResolvedValue([
    {id: '7', place: {name: '성수 카페'}},
    {id: '8', place: {name: '성수 빵집'}},
  ]);
  mockSearchSavedMedia.mockResolvedValue({reels: [reel('81'), reel('82')], nextCursor: null});
  const search = await renderSearch();

  await ReactTestRenderer.act(async () => {
    await search.current.search('성수');
  });
  await ReactTestRenderer.act(async () => {
    search.current.removePlaces(place => place.id === '7');
    search.current.removeReels(new Set(['81']));
  });
  expect(search.current.places.map(place => place.id)).toEqual(['8']);
  expect(search.current.reels.map(item => item.id)).toEqual(['82']);

  await ReactTestRenderer.act(async () => {
    search.current.clear();
  });
  expect(search.current.query).toBeNull();
  expect(search.current.places).toEqual([]);
  expect(search.current.reels).toEqual([]);
});
