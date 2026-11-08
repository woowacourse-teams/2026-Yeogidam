import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {saveContent} from '../src/entities/content/api';
import {getHistoryReelPlaceCount, getHistoryReels} from '../src/entities/content/history-api';
import {showAlert} from '../src/lib/app-alert';
import type {HistoryReel} from '../src/entities/content/types';
import {SavedPlacesLinkDialog} from '../src/pages/saved-places/components/SavedPlacesLinkDialog';
import {SavedPlacesRecentShares} from '../src/pages/saved-places/components/SavedPlacesRecentShares';
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
  getSavedPlaces: jest.fn(() => Promise.resolve([])),
  deleteSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(() => Promise.resolve(null)),
  normalizeInstagramContentUrl: (value: string) => value.trim(),
  saveContent: jest.fn(),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
  getHistoryReelDetail: jest.fn(() => Promise.reject(new Error('unused'))),
  getHistoryReelPlaceCount: jest.fn(),
}));
jest.mock('../src/lib/app-alert', () => ({showAlert: jest.fn()}));

const LINK = 'https://www.instagram.com/reel/abc/';
const places = [{id: '1', name: 'A', address: 'a', fullAddress: 'a'}];

const serverReel = (id: string): HistoryReel => ({
  id,
  instagram_url: LINK,
  instagram_title: null,
  instagram_description: '성수 카페',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: 'PROCESSING',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-11-06T00:00:00Z',
});

async function tick(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function renderAndSave() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen onOpenDetail={jest.fn()} places={places as never} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesLinkDialog).props.onChangeValue(LINK);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(SavedPlacesLinkDialog).props.onSubmit();
  });
  return renderer;
}

const rowReels = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findByType(SavedPlacesRecentShares).props.reels as HistoryReel[];

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getHistoryReels).mockReset();
  jest.mocked(showAlert).mockReset();
  jest.mocked(getHistoryReelPlaceCount).mockReset();
  jest.mocked(saveContent).mockReset().mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
});

test('최근 공유는 완료 항목의 추출 장소 수를 한 번만 조회해 표시한다', async () => {
  jest.mocked(getHistoryReelPlaceCount).mockResolvedValue(2);
  const reel = {...serverReel('8'), processing_status: 'COMPLETED' as const};
  const props = {
    reels: [reel],
    onPressAdd: jest.fn(),
    onPressViewAll: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SavedPlacesRecentShares {...props} />);
  });

  expect(getHistoryReelPlaceCount).toHaveBeenCalledTimes(1);
  expect(getHistoryReelPlaceCount).toHaveBeenCalledWith('8');
  expect(renderer.root.findAllByType(Text).map(node => node.props.children)).toContain(2);

  await ReactTestRenderer.act(async () => {
    renderer.update(<SavedPlacesRecentShares {...props} reels={[{...reel}]} />);
  });
  expect(getHistoryReelPlaceCount).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('최근 공유 장소 수 조회 실패 시 완료 항목은 계속 표시하고 재요청하지 않는다', async () => {
  jest.mocked(getHistoryReelPlaceCount).mockRejectedValue(new Error('network'));
  const reel = {...serverReel('8'), processing_status: 'COMPLETED' as const};
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesRecentShares reels={[reel]} onPressAdd={jest.fn()} onPressViewAll={jest.fn()} />,
    );
  });

  expect(renderer.root.findAllByType(Text).map(node => node.props.children)).toContain('완료');
  await ReactTestRenderer.act(async () => {
    renderer.update(
      <SavedPlacesRecentShares reels={[{...reel}]} onPressAdd={jest.fn()} onPressViewAll={jest.fn()} />,
    );
  });
  expect(getHistoryReelPlaceCount).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('저장 요청 직후에는 서버 목록에 없어도 처리 중 항목을 최근 공유에 바로 보여 준다', async () => {
  // 서버 목록은 아직 비어 있다.
  jest.mocked(getHistoryReels).mockResolvedValue({reels: [], nextCursor: null});
  const renderer = await renderAndSave();

  const reels = rowReels(renderer);
  expect(reels).toHaveLength(1);
  expect(reels[0]).toMatchObject({id: '8', processing_status: 'PROCESSING'});
  const labels = renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''));
  expect(labels).toContain('장소 찾는 중');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('서버 목록에 같은 항목이 오면 임시 항목과 겹치지 않는다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValue({reels: [serverReel('8')], nextCursor: null});
  const renderer = await renderAndSave();
  expect(rowReels(renderer)).toHaveLength(1); // 임시 항목

  await tick(3000); // 처리 중 폴링이 서버 목록을 가져온다
  const reels = rowReels(renderer);
  expect(reels).toHaveLength(1);
  expect(reels[0].instagram_thumbnail_url).toBe('https://cdn.example.com/8.jpg');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

describe('최근 공유 링 누르기', () => {
  async function renderWithHandlers() {
    jest.mocked(getHistoryReels).mockResolvedValue({reels: [], nextCursor: null});
    const onOpenReel = jest.fn();
    const onOpenHistory = jest.fn();
    const onOpenFailedReel = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SavedPlacesScreen
          onOpenDetail={jest.fn()}
          onOpenHistory={onOpenHistory}
          onOpenFailedReel={onOpenFailedReel}
          onOpenReel={onOpenReel}
          places={places as never}
        />,
      );
    });
    return {renderer, onOpenReel, onOpenHistory, onOpenFailedReel};
  }

  const press = async (
    renderer: ReactTestRenderer.ReactTestRenderer,
    status: HistoryReel['processing_status'],
  ) =>
    ReactTestRenderer.act(async () =>
      renderer.root
        .findByType(SavedPlacesRecentShares)
        .props.onPressReel({...serverReel('8'), processing_status: status}),
    );

  test('성공·처리 중·대기 중은 상세(진행) 화면으로 보낸다', async () => {
    for (const status of ['COMPLETED', 'PROCESSING', 'PENDING'] as const) {
      const {renderer, onOpenReel, onOpenHistory} = await renderWithHandlers();
      await press(renderer, status);
      expect(onOpenReel).toHaveBeenCalledWith(
        expect.objectContaining({id: '8', processing_status: status}),
      );
      expect(onOpenHistory).not.toHaveBeenCalled();
      await ReactTestRenderer.act(async () => renderer.unmount());
    }
  });

  test('실패한 공유는 해당 실패 상세로 보낸다', async () => {
    const {renderer, onOpenReel, onOpenHistory, onOpenFailedReel} = await renderWithHandlers();
    await press(renderer, 'FAILED');
    expect(onOpenFailedReel).toHaveBeenCalledWith(
      expect.objectContaining({id: '8', processing_status: 'FAILED'}),
    );
    expect(onOpenHistory).not.toHaveBeenCalled();
    expect(onOpenReel).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('보관함에서 삭제한 공유는 상세로 들어가지 않고 안내한다', async () => {
    const {renderer, onOpenReel, onOpenHistory} = await renderWithHandlers();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(SavedPlacesRecentShares).props.onPressReel({
        ...serverReel('8'),
        processing_status: 'COMPLETED',
        deleted_from_library: true,
      });
    });
    expect(showAlert).toHaveBeenCalledWith('보관함에서 삭제한 게시물이에요.');
    expect(onOpenReel).not.toHaveBeenCalled();
    expect(onOpenHistory).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});