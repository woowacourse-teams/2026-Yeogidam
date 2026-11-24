import React, {Profiler} from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getHistoryReels} from '../src/entities/content/history-api';
import {clearRecentShares, subscribeRecentShares} from '../src/entities/content/recent-shares-poller';
import {getSavedMedia} from '../src/entities/content/saved-media-api';
import type {HistoryReel} from '../src/entities/content/types';
import {getSavedPlaces} from '../src/entities/info/api';
import {SavedPlaceGrid} from '../src/pages/saved-places/components/SavedPlaceGrid';
import {SavedPlacesViewToggle} from '../src/pages/saved-places/components/SavedPlacesViewToggle';
import {SavedPostGrid} from '../src/pages/saved-places/components/SavedPostGrid';
import {SavedPlacesRecentShares} from '../src/pages/saved-places/components/SavedPlacesRecentShares';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock(
  '../src/assets/icons/place-detail/instagram-outline.svg',
  () => 'InstagramIcon',
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../src/components/BottomNavigationBar', () => ({
  BOTTOM_NAVIGATION_BAR_HEIGHT: 64,
  bottomNavigationBarContainerStyle: {},
  getBottomNavigationBarOffset: () => 0,
}));
jest.mock('../src/analytics/savedPlaceEvents', () => ({
  captureSavedPlaceSelected: jest.fn(),
  captureSavedPlacesViewed: jest.fn(),
}));
jest.mock('../src/lib/searchHistoryStorage', () => ({
  getRecentSearches: jest.fn(() => Promise.resolve([])),
  setRecentSearches: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: jest.fn(),
  deleteSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(),
  normalizeInstagramContentUrl: (value: string) => value.trim(),
  saveContent: jest.fn(),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReelPlaceCount: jest.fn(),
  getHistoryReels: jest.fn(),
}));
jest.mock('../src/entities/content/saved-media-api', () => ({
  getSavedMedia: jest.fn(),
  deleteSavedMedia: jest.fn(),
}));
jest.mock('../src/pages/saved-places/components/SavedPlaceGrid', () => {
  const actual = jest.requireActual('../src/pages/saved-places/components/SavedPlaceGrid');
  return {...actual, SavedPlaceGrid: jest.fn(actual.SavedPlaceGrid)};
});
jest.mock('../src/pages/saved-places/components/SavedPostGrid', () => {
  const actual = jest.requireActual('../src/pages/saved-places/components/SavedPostGrid');
  return {...actual, SavedPostGrid: jest.fn(actual.SavedPostGrid)};
});

const PLACE_COUNT = 150;
// 하단 탭의 최근 공유 확인 주기와 같습니다. 보관함은 이 주기로 같은 목록을 받습니다.
const BOTTOM_BAR_INTERVAL_MS = 5000;
const IDLE_MS = 10_000;
const SETTLE_MS = 20_000;

const savedPlaces = Array.from({length: PLACE_COUNT}, (_, index) => ({
  id: `saved-${index}`,
  createdAt: '2026-11-08T00:00:00Z',
  place: {
    id: `place-${index}`,
    name: `장소 ${index}`,
    latitude: 37.5,
    longitude: 127,
  },
})) as Awaited<ReturnType<typeof getSavedPlaces>>;

const recentReels: HistoryReel[] = Array.from({length: 5}, (_, index) => ({
  id: `${index + 1}`,
  instagram_url: `https://www.instagram.com/reel/${index}/`,
  instagram_title: null,
  instagram_description: '성수 카페 모음',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${index}.jpg`,
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-16T00:00:00Z',
}));

async function tick(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  clearRecentShares();
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue(savedPlaces);
  jest.mocked(getSavedMedia).mockReset().mockResolvedValue({reels: [], nextCursor: null});
  // 매번 새 배열이지만 내용은 같은 목록을 돌려줍니다. 실제 API 응답과 같습니다.
  jest.mocked(getHistoryReels).mockReset().mockImplementation(async () => ({
    reels: recentReels.map(reel => ({...reel})),
    nextCursor: null,
  }));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function renderSettledScreen(view: 'places' | 'posts') {
  const bottomBar = subscribeRecentShares({intervalMs: BOTTOM_BAR_INTERVAL_MS, onResult: () => {}});
  const profile = {commits: 0};
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Profiler id="SavedPlacesScreen" onRender={() => { profile.commits += 1; }}>
        <SavedPlacesScreen onOpenDetail={jest.fn()} />
      </Profiler>,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onChangeView(view);
  });
  // 첫 목록을 받은 뒤 최근 완료 1건을 확인하는 다시 읽기(약 10초)가 끝날 때까지 기다립니다.
  for (let elapsed = 0; elapsed < SETTLE_MS; elapsed += 1000) {
    await tick(1000);
  }
  profile.commits = 0;
  jest.mocked(SavedPlaceGrid).mockClear();
  jest.mocked(SavedPostGrid).mockClear();
  const cleanup = async () => {
    bottomBar.unsubscribe();
    await ReactTestRenderer.act(async () => renderer.unmount());
  };
  return {renderer, profile, cleanup};
}

async function wait(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    await tick(1000);
  }
}

test.each(['places', 'posts'] as const)(`장소 ${PLACE_COUNT}곳이 있는 보관함 %s 탭은 최근 공유 목록이 그대로면 다시 그리지 않는다`, async view => {
  const {profile, cleanup} = await renderSettledScreen(view);
  const requestsBefore = jest.mocked(getHistoryReels).mock.calls.length;

  await wait(IDLE_MS);

  expect(jest.mocked(getHistoryReels).mock.calls.length - requestsBefore).toBe(2);
  expect(profile.commits).toBe(0);
  expect(SavedPlaceGrid).not.toHaveBeenCalled();
  expect(SavedPostGrid).not.toHaveBeenCalled();
  await cleanup();
});

test('최근 공유의 상태가 바뀌면 최근 공유 줄을 다시 그린다', async () => {
  const {renderer, profile, cleanup} = await renderSettledScreen('places');
  jest.mocked(getHistoryReels).mockImplementation(async () => ({
    reels: [{...recentReels[0], id: '99', processing_status: 'PROCESSING'}, ...recentReels],
    nextCursor: null,
  }));

  await wait(BOTTOM_BAR_INTERVAL_MS);

  expect(profile.commits).toBeGreaterThan(0);
  expect(renderer.root.findByType(SavedPlacesRecentShares).props.reels[0]).toMatchObject({
    id: '99',
    processing_status: 'PROCESSING',
  });
  await cleanup();
});
