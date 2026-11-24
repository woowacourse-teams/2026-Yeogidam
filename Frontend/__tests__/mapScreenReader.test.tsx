import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {AccessibilityInfo, View} from 'react-native';

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
jest.mock('../src/pages/map/components/PlaceResultSheet', () => ({
  COLLAPSED_SHEET_HEIGHT: 100,
  LIST_TOP_GAP: 0,
  PlaceResultSheet: () => null,
}));
jest.mock('../spec/GoogleMapNativeComponent', () => () => null);

const savedPlaces = [
  {
    id: 'saved-1',
    createdAt: '2026-11-08T00:00:00Z',
    place: {id: 'place-1', name: '먼 곳 카페', latitude: 35.1, longitude: 129},
  },
] as Awaited<ReturnType<typeof getSavedPlaces>>;

async function renderMap() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MapScreen />);
  });
  await act(async () => {
    renderer.root.findByType(View).props.onLayout?.({nativeEvent: {layout: {height: 800}}});
  });
  return renderer;
}

beforeEach(() => {
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue(savedPlaces);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('스크린 리더가 꺼져 있으면 지도 범위를 알기 전에는 목록을 비워 둔다', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  const renderer = await renderMap();

  expect(renderer.root.findByType(PlaceResultSheet).props.places).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('스크린 리더가 켜져 있으면 지도 범위와 상관없이 저장한 장소를 모두 보여 준다', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
  const renderer = await renderMap();

  const places = renderer.root.findByType(PlaceResultSheet).props.places;
  expect(places.map((place: {name: string}) => place.name)).toEqual(['먼 곳 카페']);
  await act(async () => renderer.unmount());
});
