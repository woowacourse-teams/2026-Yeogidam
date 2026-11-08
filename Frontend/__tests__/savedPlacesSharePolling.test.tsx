import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {ScrollView} from 'react-native';

import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReels} from '../src/entities/content/history-api';
import {clearRecentShares} from '../src/entities/content/recent-shares-poller';
import {deleteSavedMedia, getSavedMedia} from '../src/entities/content/saved-media-api';
import type {HistoryReel} from '../src/entities/content/types';
import {deleteSavedPlaces, getSavedPlaces} from '../src/entities/info/api';
import {SavedPlacesLinkDialog} from '../src/pages/saved-places/components/SavedPlacesLinkDialog';
import {SavedPostGrid} from '../src/pages/saved-places/components/SavedPostGrid';
import {SavedPlaceGrid} from '../src/pages/saved-places/components/SavedPlaceGrid';
import {SavedPlacesViewToggle} from '../src/pages/saved-places/components/SavedPlacesViewToggle';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {showAlert} from '../src/lib/app-alert';
import {setSharedSaveState} from '../src/lib/reel-save-state';

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
jest.mock('../src/entities/content/saved-media-api', () => ({
  getSavedMedia: jest.fn(),
  deleteSavedMedia: jest.fn(),
}));
jest.mock('../src/lib/app-alert', () => ({showAlert: jest.fn()}));

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

async function render(onEditModeChange?: (isEditing: boolean) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen onEditModeChange={onEditModeChange} onOpenDetail={jest.fn()} />,
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
  setSharedSaveState(null);
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([]);
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getReelProcessingStatus).mockReset().mockResolvedValue(null);
  jest.mocked(saveContent).mockReset().mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  clearRecentShares();
  jest.mocked(getHistoryReels).mockReset();
  jest.mocked(getSavedMedia).mockReset().mockResolvedValue({reels: [], nextCursor: null});
  jest.mocked(deleteSavedMedia).mockReset().mockResolvedValue(undefined);
  jest.mocked(showAlert).mockReset();
});

afterEach(() => {
  setSharedSaveState(null);
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('인스타그램 공유가 완료되면 보관함이 열려 있어도 게시물 목록을 바로 다시 읽는다', async () => {
  const onSharedResultConsumed = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen
        onOpenDetail={jest.fn()}
        onSharedResultConsumed={onSharedResultConsumed}
      />,
    );
  });
  const initialPostRequests = jest.mocked(getSavedMedia).mock.calls.length;
  jest.mocked(getSavedMedia).mockResolvedValue({
    reels: [historyReel('8', 'COMPLETED')],
    nextCursor: null,
  });

  await ReactTestRenderer.act(async () => {
    setSharedSaveState({
      shareResultId: 'share-8',
      source: 'instagram_share',
      url: LINK,
      status: 'COMPLETED',
      reel: {
        id: '8',
        processing_status: 'COMPLETED',
        failure_reason: null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      },
    });
  });
  expect(jest.mocked(getSavedMedia).mock.calls.length).toBe(initialPostRequests + 1);
  expect(renderer.root.findByType(SavedPostGrid).props.reels.map(
    (reel: HistoryReel) => reel.id,
  )).toEqual(['8']);

  await tick(700);
  expect(jest.mocked(getSavedMedia).mock.calls.length).toBe(initialPostRequests + 2);
  expect(onSharedResultConsumed).toHaveBeenCalledWith('share-8');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('인스타그램 공유의 게시물 반영이 두 번의 조회보다 늦어도 자동으로 갱신한다', async () => {
  const onSharedResultConsumed = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen onOpenDetail={jest.fn()} onSharedResultConsumed={onSharedResultConsumed} />,
    );
  });
  jest.mocked(getSavedMedia)
    .mockResolvedValueOnce({reels: [], nextCursor: null})
    .mockResolvedValueOnce({reels: [], nextCursor: null})
    .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});

  await ReactTestRenderer.act(async () => {
    setSharedSaveState({
      shareResultId: 'share-8',
      source: 'instagram_share',
      url: LINK,
      status: 'COMPLETED',
      reel: {
        id: '8',
        processing_status: 'COMPLETED',
        failure_reason: null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      },
    });
  });
  await tick(700);
  expect(onSharedResultConsumed).not.toHaveBeenCalled();

  await tick(1500);
  expect(renderer.root.findByType(SavedPostGrid).props.reels.map(
    (reel: HistoryReel) => reel.id,
  )).toEqual(['8']);
  expect(onSharedResultConsumed).toHaveBeenCalledWith('share-8');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('링크 저장 뒤 처리 상태는 공용 목록 폴링으로 확인하고, 완료되면 보관함을 다시 읽고 폴링을 멈춘다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: [historyReel('8', 'PROCESSING')], nextCursor: null})
    .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
  const renderer = await render();
  const savedPlacesCallsBefore = jest.mocked(getSavedPlaces).mock.calls.length;

  await saveLink(renderer);
  expect(saveContent).toHaveBeenCalledWith(LINK, 'url_input', expect.any(String));

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

test('링크가 즉시 완료돼도 게시물 목록 반영이 늦으면 장소와 게시물을 다시 읽는다', async () => {
  jest.mocked(saveContent).mockResolvedValue({reelId: '8', status: 'COMPLETED', reused: false});
  jest.mocked(getSavedMedia)
    .mockResolvedValueOnce({reels: [], nextCursor: null})
    .mockResolvedValueOnce({reels: [], nextCursor: null})
    .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
  const renderer = await render();
  const placesBeforeSave = jest.mocked(getSavedPlaces).mock.calls.length;

  await saveLink(renderer);
  expect(jest.mocked(getSavedMedia).mock.calls.length).toBe(2);
  await tick(700);

  expect(renderer.root.findByType(SavedPostGrid).props.reels.map(
    (reel: HistoryReel) => reel.id,
  )).toEqual(['8']);
  expect(jest.mocked(getSavedPlaces).mock.calls.length).toBeGreaterThanOrEqual(placesBeforeSave + 2);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('게시물이 먼저 반영돼도 저장 장소가 늦으면 장소를 다시 읽는다', async () => {
  jest.mocked(saveContent).mockResolvedValue({reelId: '8', status: 'COMPLETED', reused: false});
  jest.mocked(getSavedMedia).mockResolvedValue({
    reels: [historyReel('8', 'COMPLETED')], nextCursor: null,
  });
  jest.mocked(getSavedPlaces)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{
      id: 'saved-1',
      createdAt: '2026-11-08T00:00:00Z',
      place: {id: 'place-1', name: '새 장소', latitude: 37.5, longitude: 127},
    }] as Awaited<ReturnType<typeof getSavedPlaces>>);
  const renderer = await render();

  await saveLink(renderer);
  await tick(700);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onChangeView('places');
  });

  expect(renderer.root.findByType(SavedPlaceGrid).props.places.map(
    (place: {id: string}) => place.id,
  )).toEqual(['place-1']);
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

test('빈 보관함에 복귀할 때 조회가 진행되거나 실패해도 기존 빈 화면을 유지한다', async () => {
  const {SavedPlacesSkeleton} = require('../src/pages/saved-places/components/SavedPlacesSkeleton');
  const {SavedPlacesEmptyState} = require('../src/pages/saved-places/components/SavedPlacesEmptyState');
  const {SavedPlacesErrorState} = require('../src/pages/saved-places/components/SavedPlacesErrorState');
  const renderer = await render();
  const onOpenDetail = renderer.root.findByType(SavedPlacesScreen).props.onOpenDetail;
  await ReactTestRenderer.act(async () => {
    renderer.update(<SavedPlacesScreen isActive={false} onOpenDetail={onOpenDetail} />);
  });
  let rejectQuery!: (error: unknown) => void;
  jest.mocked(getSavedPlaces).mockImplementationOnce(() => new Promise((_, reject) => { rejectQuery = reject; }));
  await ReactTestRenderer.act(async () => {
    renderer.update(<SavedPlacesScreen isActive onOpenDetail={onOpenDetail} />);
  });
  expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(0);
  expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(1);
  await ReactTestRenderer.act(async () => {
    rejectQuery({status: 500, errorCode: 'SERVER500_001', message: '일시적인 오류', retryable: true});
  });
  expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(1);
  expect(renderer.root.findAllByType(SavedPlacesErrorState)).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('게시물 탭은 saved-media 목록을 그리고 다음 커서로 이어 붙인다', async () => {
  const cursor = {created_at: '2026-11-04T03:12:45.123456Z', id: '81'};
  jest.mocked(getSavedMedia)
    .mockResolvedValueOnce({reels: [historyReel('81', 'COMPLETED')], nextCursor: cursor})
    .mockResolvedValueOnce({reels: [historyReel('80', 'COMPLETED')], nextCursor: null});
  const renderer = await render();
  expect(renderer.root.findByType(SavedPostGrid).props.reels.map((reel: HistoryReel) => reel.id)).toEqual(['81']);
  const list = renderer.root.findAllByType(ScrollView).find(node => typeof node.props.onScroll === 'function');
  await ReactTestRenderer.act(async () => {
    list?.props.onScroll({nativeEvent: {
      contentOffset: {y: 900},
      contentSize: {height: 1300},
      layoutMeasurement: {height: 400},
    }});
  });
  expect(getSavedMedia).toHaveBeenCalledWith(cursor);
  expect(renderer.root.findByType(SavedPostGrid).props.reels.map((reel: HistoryReel) => reel.id)).toEqual(['81', '80']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('게시물 썸네일에 추출된 장소 수를 편집 모드에서도 표시한다', async () => {
  jest.mocked(getSavedMedia).mockResolvedValue({
    reels: [{...historyReel('81', 'COMPLETED'), extracted_place_count: 3}],
    nextCursor: null,
  });
  const renderer = await render();
  expect(renderer.root.findByProps({accessibilityLabel: '추출된 장소 3곳'})).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onPressEdit();
  });
  expect(renderer.root.findByProps({accessibilityLabel: '추출된 장소 3곳'})).toBeTruthy();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('게시물 편집에서 선택한 ID를 삭제 API로 보내고 목록을 갱신한다', async () => {
  jest.mocked(getSavedMedia)
    .mockResolvedValueOnce({reels: [historyReel('81', 'COMPLETED')], nextCursor: null})
    .mockResolvedValue({reels: [], nextCursor: null});
  const onEditModeChange = jest.fn();
  const renderer = await render(onEditModeChange);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onPressEdit();
    renderer.root.findByType(SavedPostGrid).props.onToggleReelSelection('81');
  });
  expect(onEditModeChange).toHaveBeenCalledWith(true);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '선택한 게시물 삭제하기'}).props.onPress();
  });
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('장소 보관함과 지도에서 사라져요.');
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(deleteSavedMedia).toHaveBeenCalledWith(['81']);
  expect(getSavedMedia).toHaveBeenCalledTimes(2);
  expect(onEditModeChange).toHaveBeenCalledWith(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('장소 편집은 북마크 해제를 안내하고 저장 장소 ID로 해제한다', async () => {
  jest.mocked(getSavedPlaces).mockResolvedValue([{
    id: '99',
    createdAt: '2026-10-16T00:00:00Z',
    place: {id: '1', name: '카페 온월', address: '서울 성동구'},
  }] as never);
  const renderer = await render();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onChangeView('places');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesViewToggle).props.onPressEdit();
    renderer.root.findByType(SavedPlaceGrid).props.onTogglePlaceSelection('1');
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '선택한 장소 북마크 해제하기'}).props.onPress();
  });
  expect(jest.mocked(showAlert).mock.calls[0][0]).toBe('선택한 장소의 북마크를 해제할까요?');
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('장소 보관함과 지도에서 사라져요.');
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('해당 게시물에서 다시 북마크할 수 있어요.');
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  expect(buttons[1]?.text).toBe('북마크 해제');
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(deleteSavedPlaces).toHaveBeenCalledWith(['99']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
