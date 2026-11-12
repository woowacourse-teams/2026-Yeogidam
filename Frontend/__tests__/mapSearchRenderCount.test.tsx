import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {AccessibilityInfo, View} from 'react-native';

import GoogleMapNativeComponent from '../spec/GoogleMapNativeComponent';
import {SearchBar} from '../src/components/SearchBar';
import {getSavedPlaces} from '../src/entities/info/api';
import {MapScreen} from '../src/pages/map/MapScreen';
import {PlaceResultSheet} from '../src/pages/map/components/PlaceResultSheet';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../src/components/BottomNavigationBar', () => ({
  BOTTOM_NAVIGATION_BAR_HEIGHT: 64,
  getBottomNavigationBarOffset: () => 0,
}));
jest.mock('../src/entities/info/api', () => ({getSavedPlaces: jest.fn()}));
jest.mock('../src/entities/content/recent-shares-poller', () => ({
  subscribeRecentShares: jest.fn(() => ({
    refresh: jest.fn(),
    unsubscribe: jest.fn(),
  })),
}));
jest.mock('../src/lib/usePlaceFolders', () => ({
  MAX_FOLDER_COUNT: 10,
  syncSavedPlaceFolderIds: jest.fn(),
  usePlaceFolders: () => ({
    folders: [],
    getPlaceFolderIds: () => [],
    createFolder: jest.fn(),
    updateFolder: jest.fn(),
    deleteFolder: jest.fn(),
    setPlaceFolderIds: jest.fn(),
  }),
}));
jest.mock('../src/lib/location-permission', () => ({
  subscribeLocationPermission: () => jest.fn(),
  checkLocationPermission: jest.fn(() => Promise.resolve(false)),
  ensureLocationPermission: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../src/pages/map/components/PlaceFolderPanel', () => ({
  FolderDetailHeader: () => null,
  FolderActionSheet: () => null,
  FolderList: () => null,
  FolderNameDialog: () => null,
  FolderSegmentHeader: () => null,
  PlaceFolderAssignPicker: () => null,
}));
// 실제 시트처럼 지도와, 뒤로 가기 미리보기·지금 화면 두 페이지를 그립니다.
jest.mock('../src/pages/map/components/PlaceResultSheet', () => {
  const page = {
    isDetail: false,
    isExpanded: false,
    place: null,
    sheetHeight: 300,
    sheetBottomOffset: 0,
    sheetVisibleHeight: 300,
    translateY: 0,
  };
  return {
    COLLAPSED_SHEET_HEIGHT: 100,
    LIST_TOP_GAP: 0,
    PlaceResultSheet: jest.fn(({renderMap, renderPage}) => (
      <>
        {renderMap?.(page)}
        {renderPage(null, {...page, isBackPreview: true})}
        {renderPage(null, page)}
      </>
    )),
  };
});
jest.mock('../spec/GoogleMapNativeComponent', () => jest.fn(() => null));

const PLACE_COUNT = 150;
// "카페"를 한글 키보드로 칠 때 검색창에 들어오는 값 순서입니다.
const TYPED_VALUES = ['ㅋ', '카', '캎', '카페'];

const savedPlaces = Array.from({length: PLACE_COUNT}, (_, index) => ({
  id: `saved-${index}`,
  createdAt: '2026-11-08T00:00:00Z',
  place: {
    id: `place-${index}`,
    name: `장소 ${index}`,
    latitude: 37.5 + index * 0.001,
    longitude: 127 + index * 0.001,
  },
})) as Awaited<ReturnType<typeof getSavedPlaces>>;

beforeEach(() => {
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue(savedPlaces);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderMap() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MapScreen />);
  });
  await act(async () => {
    renderer.root.findByType(View).props.onLayout?.({nativeEvent: {layout: {height: 800}}});
  });
  jest.mocked(PlaceResultSheet).mockClear();
  jest.mocked(GoogleMapNativeComponent).mockClear();
  return renderer;
}

async function typeInto(renderer: TestRenderer.ReactTestRenderer, value: string) {
  const searchBars = renderer.root.findAllByType(SearchBar);
  await act(async () => {
    searchBars[searchBars.length - 1].props.onChangeText(value);
  });
}

test(`장소 ${PLACE_COUNT}곳이 있어도 검색어를 입력하는 동안 지도 화면은 첫 글자에서만 다시 그린다`, async () => {
  const renderer = await renderMap();

  for (const value of TYPED_VALUES) {
    await typeInto(renderer, value);
  }

  // 첫 글자에서 뒤로 가기 버튼이 생기므로 한 번은 다시 그리고, 그 뒤 글자는 검색창만 다시 그린다.
  expect(PlaceResultSheet).toHaveBeenCalledTimes(1);
  expect(GoogleMapNativeComponent).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(SearchBar).map(bar => bar.props.value)).toEqual(['카페', '카페']);
  await act(async () => renderer.unmount());
});

test('검색어를 모두 지우면 지도 화면을 한 번 다시 그려 검색 전 상태로 돌아간다', async () => {
  const renderer = await renderMap();
  await typeInto(renderer, '카페');
  jest.mocked(PlaceResultSheet).mockClear();

  await typeInto(renderer, '');

  expect(PlaceResultSheet).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(SearchBar).map(bar => bar.props.value)).toEqual(['', '']);
  await act(async () => renderer.unmount());
});
