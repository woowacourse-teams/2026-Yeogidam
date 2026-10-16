import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getSavedPlaces} from '../src/entities/info/api';
import {clearSavedPlacesCache} from '../src/entities/info/saved-places-cache';
import type {SavedPlaceListItem} from '../src/entities/info/types';
import type {Place} from '../src/entities/place/types';
import {useSavedPlacesList} from '../src/pages/saved-places/hooks/useSavedPlacesList';
import {deferred} from './support/deferred';
import {flushMicrotasks, renderTracked} from './support/renderers';
import {BAKERY, CAFE, savedPlace} from './support/savedPlacesFixtures';

jest.mock('../src/entities/info/api', () => ({getSavedPlaces: jest.fn()}));

// 화면 테스트(savedPlacesScreen.test.tsx)가 보지 못하는 읽기 상태와 loadSavedPlaces의 반환값을 봅니다.

const RESTAURANT = savedPlace(3, '식당');

let latest: ReturnType<typeof useSavedPlacesList>;

function Harness() {
  latest = useSavedPlacesList({providedPlaces: undefined});
  return null;
}

const act = ReactTestRenderer.act;

/** 훅을 그리고 처음 읽기가 끝나기를 기다립니다. */
async function renderLoaded(items: SavedPlaceListItem[]) {
  jest.mocked(getSavedPlaces).mockResolvedValueOnce(items);
  await renderTracked(<Harness />);
  await flushMicrotasks();
}

/** 응답을 미뤄 둔 조회를 시작하고, 반환값을 나중에 확인할 수 있게 promise를 돌려줍니다. */
function startLoad(...responses: Promise<SavedPlaceListItem[]>[]) {
  for (const response of responses) {
    jest.mocked(getSavedPlaces).mockReturnValueOnce(response);
  }
  let pending!: Promise<Place[] | null>;
  act(() => {
    pending = latest.loadSavedPlaces();
  });
  return pending;
}

const names = () => latest.places.map(place => place.name);

beforeEach(() => {
  clearSavedPlacesCache();
  jest.mocked(getSavedPlaces).mockReset();
});

test('읽는 동안 한 번 지우면 그 응답을 버리고 다시 읽은 목록을 반영해 돌려준다', async () => {
  await renderLoaded([CAFE, BAKERY]);
  const lateLoad = deferred<SavedPlaceListItem[]>();
  const reload = deferred<SavedPlaceListItem[]>();
  const pending = startLoad(lateLoad.promise, reload.promise);
  expect(latest.isLoading).toBe(true);

  act(() => latest.removePlaces(place => place.name === '카페'));
  await act(async () => lateLoad.resolve([CAFE, BAKERY]));
  await flushMicrotasks();
  expect(names()).toEqual(['빵집']);
  expect(latest.isLoading).toBe(true);

  await act(async () => reload.resolve([BAKERY, RESTAURANT]));
  await flushMicrotasks();
  expect((await pending)?.map(place => place.name)).toEqual(['빵집', '식당']);
  expect(names()).toEqual(['빵집', '식당']);
  expect(latest.isLoading).toBe(false);
  expect(getSavedPlaces).toHaveBeenCalledTimes(3);
});

test('두 번 읽는 동안 두 번 다 지우면 두 번째 응답도 버리고, 읽기를 끝낸 채 null을 돌려준다', async () => {
  await renderLoaded([CAFE, BAKERY, RESTAURANT]);
  const lateLoad = deferred<SavedPlaceListItem[]>();
  const reload = deferred<SavedPlaceListItem[]>();
  const pending = startLoad(lateLoad.promise, reload.promise);

  act(() => latest.removePlaces(place => place.name === '카페'));
  await act(async () => lateLoad.resolve([CAFE, BAKERY, RESTAURANT]));
  await flushMicrotasks();
  expect(getSavedPlaces).toHaveBeenCalledTimes(3);

  act(() => latest.removePlaces(place => place.name === '빵집'));
  await act(async () => reload.resolve([BAKERY, RESTAURANT]));
  await flushMicrotasks();
  expect(await pending).toBeNull();
  expect(names()).toEqual(['식당']);
  expect(latest.isLoading).toBe(false);
  expect(getSavedPlaces).toHaveBeenCalledTimes(3);
});

test('읽는 동안 세션이 끝나 캐시를 비우면 응답을 버리고 다시 읽지 않으며 null을 돌려준다', async () => {
  await renderLoaded([CAFE, BAKERY]);
  const lateLoad = deferred<SavedPlaceListItem[]>();
  const pending = startLoad(lateLoad.promise);

  clearSavedPlacesCache();
  await act(async () => lateLoad.resolve([CAFE]));
  await flushMicrotasks();
  expect(await pending).toBeNull();
  expect(names()).toEqual(['카페', '빵집']);
  expect(getSavedPlaces).toHaveBeenCalledTimes(2);
});

test('더 새 조회에 밀린 응답은 버리고 null을 돌려주며, 새 조회의 응답만 반영한다', async () => {
  await renderLoaded([CAFE]);
  const firstLoad = deferred<SavedPlaceListItem[]>();
  const secondLoad = deferred<SavedPlaceListItem[]>();
  const first = startLoad(firstLoad.promise);
  const second = startLoad(secondLoad.promise);

  await act(async () => secondLoad.resolve([CAFE, BAKERY]));
  await flushMicrotasks();
  expect(names()).toEqual(['카페', '빵집']);

  await act(async () => firstLoad.resolve([CAFE]));
  await flushMicrotasks();
  expect(await first).toBeNull();
  expect((await second)?.map(place => place.name)).toEqual(['카페', '빵집']);
  expect(names()).toEqual(['카페', '빵집']);
});
