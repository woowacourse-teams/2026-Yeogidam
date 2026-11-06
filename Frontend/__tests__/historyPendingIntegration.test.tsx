import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {saveContent} from '../src/entities/content/api';
import {getHistoryReels} from '../src/entities/content/history-api';
import {setSharedSaveState} from '../src/lib/reel-save-state';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
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
jest.mock('../src/analytics/placeExtractionEvents', () => ({
  trackHistoryViewed: jest.fn(),
  trackHistoryContentViewed: jest.fn(),
  trackPlaceExtractionFinished: jest.fn(),
  trackPlaceExtractionStarted: jest.fn(),
}));
jest.mock('../src/assets/icons/actions/retry.svg', () => 'RetryIcon');
jest.mock('../src/assets/icons/actions/report.svg', () => 'ReportIcon');
jest.mock('../src/assets/icons/social/instagram-color.svg', () => 'InstagramIcon');
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
  getHistoryReelDetail: jest.fn(),
  reportHistoryReel: jest.fn(),
  retryHistoryReelExtraction: jest.fn(),
}));

const LINK = 'https://www.instagram.com/reel/abc/';
const places = [{id: '1', name: 'A', address: 'a', fullAddress: 'a'}];

beforeEach(() => {
  jest.useFakeTimers();
  setSharedSaveState(null);
  jest.mocked(getHistoryReels).mockReset().mockResolvedValue({reels: [], nextCursor: null});
  jest.mocked(saveContent).mockReset().mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
});

afterEach(() => {
  setSharedSaveState(null);
  jest.clearAllTimers();
  jest.useRealTimers();
});

const historyItemIds = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll(node => typeof node.props?.onLayout === 'function' && node.props?.reel)
    .map(node => node.props.reel.id as string)
    .filter((id, index, ids) => ids.indexOf(id) === index);

test('보관함에서 링크를 저장하면 열려 있는 히스토리에 처리 중 항목이 바로 생긴다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <>
        <SavedPlacesScreen onOpenDetail={jest.fn()} places={places as never} />
        <HistoryScreen onBack={jest.fn()} />
      </>,
    );
  });
  expect(historyItemIds(renderer)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesLinkDialog).props.onChangeValue(LINK);
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(SavedPlacesLinkDialog).props.onSubmit();
  });

  // 서버 목록에는 아직 없어도 히스토리에 항목이 있어야 한다.
  expect(historyItemIds(renderer)).toEqual(['8']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('저장을 누른 직후(서버 응답 전)에도 임시 항목이 보인다', async () => {
  let resolveSave!: (value: {reelId: string; status: 'PROCESSING'; reused: boolean}) => void;
  jest.mocked(saveContent).mockImplementation(
    () => new Promise(resolve => { resolveSave = resolve; }),
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <>
        <SavedPlacesScreen onOpenDetail={jest.fn()} places={places as never} />
        <HistoryScreen onBack={jest.fn()} />
      </>,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesLinkDialog).props.onChangeValue(LINK);
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesLinkDialog).props.onSubmit();
  });

  const ids = historyItemIds(renderer);
  expect(ids).toHaveLength(1);
  expect(ids[0]).toMatch(/^manual-/);

  await ReactTestRenderer.act(async () => {
    resolveSave({reelId: '8', status: 'PROCESSING', reused: false});
  });
  expect(historyItemIds(renderer)).toEqual(['8']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('링크를 저장한 뒤 히스토리를 처음 열어도 처리 중 항목이 보인다', async () => {
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

  // 이제서야 히스토리를 처음 연다(앱에서는 방문한 탭만 그려진다).
  await ReactTestRenderer.act(async () => {
    renderer.update(
      <>
        <SavedPlacesScreen onOpenDetail={jest.fn()} places={places as never} />
        <HistoryScreen onBack={jest.fn()} />
      </>,
    );
  });
  expect(historyItemIds(renderer)).toEqual(['8']);

  // 목록 조회가 끝나도(서버 목록에 아직 없어도) 계속 보인다.
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3000);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  expect(historyItemIds(renderer)).toEqual(['8']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
