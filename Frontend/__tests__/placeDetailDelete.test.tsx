import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {deleteSavedPlaces, getPlaceReels, getSavedPlaces} from '../src/entities/info/api';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import type {Place} from '../src/entities/place/types';
import {PlaceDetailActionSheet} from '../src/pages/place-detail/components/PlaceDetailActionSheet';
import {PlaceDetailScreen} from '../src/pages/place-detail/PlaceDetailScreen';
import {flushMicrotasks, renderTracked, type Renderer} from './support/renderers';
import {BAKERY, CACHED_CAFE, CACHED_PLACES, SERVER_ERROR, TIMEOUT_ERROR} from './support/savedPlacesFixtures';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getPlaceReels: jest.fn(),
  getSavedPlaces: jest.fn(),
}));
jest.mock('../src/pages/place-detail/components/CopyToast', () => ({
  CopyToastProvider: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('../src/pages/place-detail/components/PlaceDetailContent', () => ({
  PlaceDetailContent: () => null,
}));
jest.mock('../src/pages/place-detail/components/PlaceDetailActionSheet', () => ({
  PlaceDetailActionSheet: () => null,
}));

const act = ReactTestRenderer.act;
let alertSpy: jest.SpyInstance;

async function renderDetail(target: Place) {
  const onBack = jest.fn();
  const renderer = await renderTracked(<PlaceDetailScreen onBack={onBack} place={target} />);
  return {renderer, onBack};
}

/** 상세의 더 보기 시트에서 삭제를 누르고 확인 창의 '삭제'를 누릅니다. */
async function deleteFromSheet(renderer: Renderer) {
  await act(async () => {
    renderer.root.findByType(PlaceDetailActionSheet).props.onDelete();
  });
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2];
  await act(async () => {
    buttons.find((button: {text: string}) => button.text === '삭제').onPress();
  });
  await flushMicrotasks();
}

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.mocked(getPlaceReels).mockResolvedValue([]);
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSavedPlaces).mockReset();
});

afterEach(() => {
  alertSpy.mockRestore();
});

test('상세에서 지우기에 성공하면 보관함 캐시에서도 빼고 돌아간다', async () => {
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await deleteFromSheet(renderer);

  expect(deleteSavedPlaces).toHaveBeenCalledWith(['saved-1']);
  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('삭제 응답이 늦어 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 캐시에서 뺀다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await deleteFromSheet(renderer);

  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['빵집']);
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('지우기에 실패하면 캐시를 그대로 두고 돌아가지 않는다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(SERVER_ERROR);
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await deleteFromSheet(renderer);

  expect(readSavedPlacesCache()?.map(cached => cached.name)).toEqual(['카페', '빵집']);
  expect(onBack).not.toHaveBeenCalled();
});
