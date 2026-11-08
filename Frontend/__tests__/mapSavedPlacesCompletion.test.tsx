import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {View} from 'react-native';

import {subscribeRecentShares} from '../src/entities/content/recent-shares-poller';
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
jest.mock('../spec/KakaoMapNativeComponent', () => () => null);

const completed = (id: string) => ({id, processing_status: 'COMPLETED'});
const processing = (id: string) => ({id, processing_status: 'PROCESSING'});

async function showShares(reels: ReturnType<typeof completed>[]) {
  await act(async () => {
    jest.mocked(subscribeRecentShares).mock.calls[0][0].onResult({
      reels: reels as Parameters<
        Parameters<typeof subscribeRecentShares>[0]['onResult']
      >[0]['reels'],
      nextCursor: null,
    });
  });
}

beforeEach(() => {
  jest.mocked(subscribeRecentShares).mockClear();
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([]);
});

test('첫 공유 목록에 완료 항목이 있으면 저장 장소를 다시 읽는다', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MapScreen />);
  });
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);

  await showShares([completed('new-reel')]);
  expect(getSavedPlaces).toHaveBeenCalledTimes(2);

  await showShares([completed('new-reel')]);
  expect(getSavedPlaces).toHaveBeenCalledTimes(2);
  await act(async () => renderer.unmount());
});

test('첫 공유 목록에 완료 항목이 없어도 이후 완료 전환을 감지한다', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MapScreen />);
  });
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);

  await showShares([processing('new-reel')]);
  expect(getSavedPlaces).toHaveBeenCalledTimes(1);

  await showShares([completed('new-reel')]);
  expect(getSavedPlaces).toHaveBeenCalledTimes(2);
  await act(async () => renderer.unmount());
});

test('완료 결과로 다시 읽는 동안 이전 장소 조회가 늦게 끝나도 새 목록을 유지한다', async () => {
  let resolveFirst!: (places: Awaited<ReturnType<typeof getSavedPlaces>>) => void;
  jest.mocked(getSavedPlaces)
    .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce([{
      id: 'saved-1',
      createdAt: '2026-11-08T00:00:00Z',
      place: {id: 'place-1', name: '새 장소', latitude: 37.5, longitude: 127},
    }] as Awaited<ReturnType<typeof getSavedPlaces>>);

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<MapScreen />);
  });
  await act(async () => {
    renderer.root.findByType(View).props.onLayout?.({nativeEvent: {layout: {height: 800}}});
  });

  await showShares([completed('new-reel')]);
  // 저장 장소가 하나라도 있으면 빈 목록 안내가 'noSavedPlaces'가 아니라 'outOfArea'가 된다.
  expect(renderer.root.findByType(PlaceResultSheet).props.emptyState.kind).toBe('outOfArea');

  await act(async () => resolveFirst([]));
  expect(renderer.root.findByType(PlaceResultSheet).props.emptyState.kind).toBe('outOfArea');
  await act(async () => renderer.unmount());
});
