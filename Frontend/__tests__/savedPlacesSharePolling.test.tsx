import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {ScrollView} from 'react-native';

import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReelPlaceCount, getHistoryReels} from '../src/entities/content/history-api';
import {clearRecentShares, subscribeRecentShares} from '../src/entities/content/recent-shares-poller';
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
import {announce, focusAccessibility} from '../src/lib/accessibility';
import {SavedPlacesRecentShares} from '../src/pages/saved-places/components/SavedPlacesRecentShares';

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
jest.mock('../src/lib/accessibility', () => ({
  ...jest.requireActual('../src/lib/accessibility'),
  announce: jest.fn(),
  focusAccessibility: jest.fn(() => () => undefined),
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
  jest.mocked(getHistoryReelPlaceCount).mockReset().mockResolvedValue(0);
  jest.mocked(announce).mockReset();
  jest.mocked(focusAccessibility).mockClear();
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

test('히스토리의 처리 중 공유가 완료되면 보관함의 게시물과 장소를 갱신한다', async () => {
  jest.mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: [historyReel('8', 'PROCESSING')], nextCursor: null})
    .mockResolvedValueOnce({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
  const renderer = await render();
  const subscription = subscribeRecentShares({intervalMs: 60_000, onResult: () => undefined});
  await ReactTestRenderer.act(async () => {
    await subscription.refresh();
  });
  const postRequestsBeforeCompletion = jest.mocked(getSavedMedia).mock.calls.length;
  const placeRequestsBeforeCompletion = jest.mocked(getSavedPlaces).mock.calls.length;
  jest.mocked(getSavedMedia).mockResolvedValue({
    reels: [historyReel('8', 'COMPLETED')], nextCursor: null,
  });

  await ReactTestRenderer.act(async () => {
    await subscription.refresh();
  });
  expect(jest.mocked(getSavedMedia).mock.calls.length).toBeGreaterThan(postRequestsBeforeCompletion);
  expect(jest.mocked(getSavedPlaces).mock.calls.length).toBeGreaterThan(placeRequestsBeforeCompletion);
  expect(renderer.root.findByType(SavedPostGrid).props.reels.map(
    (reel: HistoryReel) => reel.id,
  )).toEqual(['8']);
  subscription.unsubscribe();
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

test('게시물 썸네일에 추출된 장소 수를 표시하지 않는다', async () => {
  jest.mocked(getSavedMedia).mockResolvedValue({
    reels: [{...historyReel('81', 'COMPLETED'), extracted_place_count: 3}],
    nextCursor: null,
  });
  const renderer = await render();
  expect(renderer.root.findAllByProps({accessibilityLabel: '추출된 장소 3곳'})).toHaveLength(0);
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
  // 편집 모드에 들어가면 스크린 리더로 알려 준다.
  expect(announce).toHaveBeenCalledWith(expect.stringContaining('편집 모드'));
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '선택한 게시물 1개 삭제하기'}).props.onPress();
  });
  expect(jest.mocked(showAlert).mock.calls[0][1]).toContain('장소 보관함과 지도에서 사라져요.');
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(deleteSavedMedia).toHaveBeenCalledWith(['81']);
  expect(getSavedMedia).toHaveBeenCalledTimes(2);
  expect(onEditModeChange).toHaveBeenCalledWith(false);
  expect(announce).toHaveBeenLastCalledWith('편집을 마쳤어요');
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
    renderer.root.findByProps({accessibilityLabel: '선택한 장소 1개 북마크 해제하기'}).props.onPress();
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

describe('장소 찾기 상태 안내', () => {
  test('보관함이 비어 최근 공유 줄이 없으면 장소를 찾는 중이라고 읽고, 끝나면 찾은 장소 수를 한 번만 읽는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValueOnce({reels: [historyReel('8', 'PROCESSING')], nextCursor: null})
      .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
    jest.mocked(getHistoryReelPlaceCount).mockResolvedValue(3);
    const renderer = await render();

    await saveLink(renderer);
    expect(announce).toHaveBeenCalledWith('링크를 받았어요. 장소를 찾는 중이에요.');

    await tick(3000);
    expect(announce).toHaveBeenCalledTimes(1);

    await tick(3000);
    expect(getHistoryReelPlaceCount).toHaveBeenCalledWith('8');
    expect(announce).toHaveBeenLastCalledWith('장소 3곳을 찾았어요.');

    await tick(9000);
    expect(announce).toHaveBeenCalledTimes(2);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('iOS에서는 입력창이 완전히 닫힌 뒤에 방금 추가한 공유로 포커스를 옮기고 따로 읽지 않는다', async () => {
    jest.mocked(getSavedPlaces).mockResolvedValue([{
      id: 'saved-1',
      createdAt: '2026-11-08T00:00:00Z',
      place: {id: 'place-1', name: '저장한 장소', latitude: 37.5, longitude: 127},
    }] as Awaited<ReturnType<typeof getSavedPlaces>>);
    jest.mocked(getHistoryReels).mockResolvedValue({
      reels: [historyReel('8', 'PROCESSING')],
      nextCursor: null,
    });
    const renderer = await render();

    await saveLink(renderer);

    // 닫히는 중에는 아직 옮기지 않는다.
    const recentShares = () => renderer.root.findByType(SavedPlacesRecentShares);
    expect(recentShares().props.focusRequest).toBeNull();
    expect(focusAccessibility).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(SavedPlacesLinkDialog).props.onDismiss();
    });
    expect(recentShares().props.focusRequest).toEqual({reelId: '8', requestId: expect.any(Number)});
    expect(focusAccessibility).toHaveBeenCalledWith({current: expect.anything()}, 300);
    expect(announce).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('공유 시트로 보낸 링크를 처리하기 시작하면 포커스는 두고 장소를 찾는 중이라고 한 번만 읽는다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue({
      reels: [historyReel('8', 'PROCESSING')],
      nextCursor: null,
    });
    const renderer = await render();
    const sharedState = {
      shareResultId: 'share-8',
      source: 'instagram_share' as const,
      url: LINK,
      status: 'PROCESSING' as const,
      reel: {
        id: 'share-8',
        processing_status: 'PROCESSING' as const,
        failure_reason: null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      },
    };

    await ReactTestRenderer.act(async () => setSharedSaveState(sharedState));
    await ReactTestRenderer.act(async () => setSharedSaveState({...sharedState}));

    // 앱으로 막 돌아와 VoiceOver가 화면을 읽는 중이라 바로 읽지 않는다.
    expect(announce).not.toHaveBeenCalled();
    await tick(1000);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('공유한 링크에서 장소를 찾는 중이에요.', {queue: true});
    expect(focusAccessibility).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('10초가 지나도 찾는 중이면 아직 찾고 있다고 한 번만 읽고, 끝나면 결과를 읽는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: [historyReel('8', 'PROCESSING')], nextCursor: null});
    const renderer = await render();

    await saveLink(renderer);
    jest.mocked(announce).mockClear();

    await tick(6000);
    expect(announce).not.toHaveBeenCalled();
    await tick(1000);
    expect(announce).not.toHaveBeenCalled();
    await tick(3000);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('아직 장소를 찾고 있어요.', {queue: true});

    await tick(30_000);
    expect(announce).toHaveBeenCalledTimes(1);

    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
    jest.mocked(getHistoryReelPlaceCount).mockResolvedValue(4);
    await tick(3000);
    expect(announce).toHaveBeenLastCalledWith('장소 4곳을 찾았어요.');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('10초 전에 끝나면 아직 찾고 있다는 안내는 읽지 않는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValueOnce({reels: [historyReel('8', 'PROCESSING')], nextCursor: null})
      .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
    const renderer = await render();

    await saveLink(renderer);
    await tick(3000);
    await tick(3000);
    await tick(30_000);

    expect(announce).not.toHaveBeenCalledWith('아직 장소를 찾고 있어요.', {queue: true});
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('90초가 지나 상태 확인 폴링이 멈춘 뒤에 끝나도 최근 공유 목록에서 보고 결과를 읽는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: [historyReel('8', 'PROCESSING')], nextCursor: null});
    jest.mocked(getHistoryReelPlaceCount).mockResolvedValue(4);
    const renderer = await render();

    await saveLink(renderer);
    for (let elapsed = 0; elapsed < 93_000; elapsed += 3000) await tick(3000);
    const callsAfterTimeout = jest.mocked(getHistoryReels).mock.calls.length;
    await tick(3000);
    // 상태 확인 폴링은 멈추고, 최근 공유 줄의 느린 주기만 남는다.
    expect(jest.mocked(getHistoryReels).mock.calls.length).toBe(callsAfterTimeout);

    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: [historyReel('8', 'COMPLETED')], nextCursor: null});
    await tick(60_000);

    expect(announce).toHaveBeenLastCalledWith('장소 4곳을 찾았어요.');
    expect(
      jest.mocked(announce).mock.calls.filter(([message]) => message.startsWith('장소 4곳')),
    ).toHaveLength(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('장소 찾기에 실패하면 실패했다고 읽는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: [historyReel('8', 'FAILED')], nextCursor: null});
    const renderer = await render();

    await saveLink(renderer);
    await tick(3000);

    expect(announce).toHaveBeenLastCalledWith('장소를 찾지 못했어요. 다시 시도해 주세요.');
    expect(getHistoryReelPlaceCount).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('바로 완료된 링크는 접수 안내 없이 결과를 읽고, 장소 수를 못 읽으면 끝났다는 것만 읽는다', async () => {
    jest.mocked(saveContent).mockResolvedValue({reelId: '8', status: 'COMPLETED', reused: true});
    jest.mocked(getHistoryReelPlaceCount).mockRejectedValue(new Error('network'));
    const renderer = await render();

    await saveLink(renderer);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('장소 찾기가 끝났어요.');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('저장 요청이 실패하면 입력창 아래 오류 문구를 읽어 준다', async () => {
    jest.mocked(saveContent).mockRejectedValue(
      new ReelApiError({
        errorCode: 'REEL400_001',
        message: '인스타그램 릴스나 게시물 링크를 넣어주세요.',
        retryable: false,
      }),
    );
    const renderer = await render();

    await saveLink(renderer);

    expect(announce).toHaveBeenCalledWith('인스타그램 릴스나 게시물 링크를 넣어주세요.');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
