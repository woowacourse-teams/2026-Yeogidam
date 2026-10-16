import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReels} from '../src/entities/content/history-api';
import type {HistoryReel} from '../src/entities/content/types';
import {getSavedPlaces} from '../src/entities/info/api';
import {SavedPlacesLinkDialog} from '../src/pages/saved-places/components/SavedPlacesLinkDialog';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
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
  getHistoryReels: jest.fn(),
}));

const LINK = 'https://www.instagram.com/reel/abc/';

const historyReel = (
  id: string,
  status: HistoryReel['processing_status'],
): HistoryReel => ({
  id,
  instagram_url: LINK,
  instagram_title: null,
  instagram_description: '성수 카페 모음',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: status,
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-16T00:00:00Z',
});

async function tick(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen onOpenDetail={jest.fn()} />,
    );
  });
  return renderer;
}

async function saveLink(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesLinkDialog).props.onChangeValue(LINK);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(SavedPlacesLinkDialog).props.onSubmit();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([]);
  jest.mocked(getReelProcessingStatus).mockReset().mockResolvedValue(null);
  jest.mocked(saveContent).mockReset().mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  jest.mocked(getHistoryReels).mockReset();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('링크 저장 뒤 처리 상태는 공용 목록 폴링으로 확인하고, 완료되면 보관함을 다시 읽고 폴링을 멈춘다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: [historyReel('8', 'PROCESSING')], nextCursor: null})
    .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
  const renderer = await render();
  const savedPlacesCallsBefore = jest.mocked(getSavedPlaces).mock.calls.length;

  await saveLink(renderer);
  expect(saveContent).toHaveBeenCalledWith(LINK);

  // 아직 처리 중이면 보관함을 다시 읽지 않는다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(getHistoryReels).toHaveBeenCalledWith();
  expect(getSavedPlaces).toHaveBeenCalledTimes(savedPlacesCallsBefore);

  // 완료되면 저장된 장소를 바로 반영한다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(jest.mocked(getSavedPlaces).mock.calls.length).toBeGreaterThan(savedPlacesCallsBefore);

  // 완료 뒤에는 이 화면이 구독을 끝내 더 읽지 않는다.
  await tick(9000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  // 상태 확인은 단건 조회 없이 목록 폴링으로만 한다.
  expect(getReelProcessingStatus).not.toHaveBeenCalledWith('8');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('목록 조회가 연속으로 실패하면 세 번째에 처리 상태 확인을 멈춘다', async () => {
  // 실제 네트워크 실패는 다시 시도할 수 있는 ReelApiError로 온다.
  jest.mocked(getHistoryReels).mockRejectedValue(
    new ReelApiError({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
    }),
  );
  const renderer = await render();

  await saveLink(renderer);
  await tick(3000);
  await tick(3000);
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);

  await tick(9000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
