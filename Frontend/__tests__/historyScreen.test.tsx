import React from 'react';
import {Alert, ScrollView} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  getHistoryReelDetail,
  getHistoryReels,
  retryHistoryReelExtraction,
} from '../src/entities/content/history-api';
import type {HistoryReel} from '../src/entities/content/types';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../src/components/BottomNavigationBar', () => ({
  BOTTOM_NAVIGATION_BAR_HEIGHT: 64,
  getBottomNavigationBarOffset: () => 0,
}));
jest.mock('../src/analytics/placeExtractionEvents', () => ({
  toExtractionFailureType: jest.fn(() => 'unknown'),
  trackExtractionRequestFinished: jest.fn(),
  trackExtractionRequestStarted: jest.fn(),
  trackHistoryContentDetailViewed: jest.fn(),
  trackHistoryContentViewed: jest.fn(),
  trackHistoryViewed: jest.fn(),
}));
jest.mock('../src/assets/icons/actions/retry.svg', () => 'RetryIcon');
jest.mock('../src/assets/icons/actions/report.svg', () => 'ReportIcon');
jest.mock('../src/assets/icons/social/instagram-color.svg', () => 'InstagramIcon');
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
  getHistoryReelDetail: jest.fn(() => Promise.resolve(null)),
  reportHistoryReel: jest.fn(),
  retryHistoryReelExtraction: jest.fn(),
}));

const reel = (id: number, status: HistoryReel['processing_status'] = 'COMPLETED'): HistoryReel => ({
  id: String(id),
  instagram_url: `https://www.instagram.com/reel/${id}/`,
  instagram_title: null,
  instagram_description: `게시물 ${id}`,
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: status,
  failure_reason: status === 'FAILED' ? 'PLACE_NOT_MATCHED' : null,
  save_mode: null,
  created_at: '2026-10-15T00:00:00Z',
});

const page = (ids: number[], status?: HistoryReel['processing_status']) =>
  ids.map(id => reel(id, status));

async function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<HistoryScreen onBack={jest.fn()} />);
  });
  return renderer;
}

const renderedIds = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll(node => typeof node.props.onLayout === 'function' && node.props.reel)
    .map(node => node.props.reel.id as string)
    .filter((id, index, ids) => ids.indexOf(id) === index);

async function tick(ms: number) {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getHistoryReels).mockReset();
  jest.mocked(getHistoryReelDetail).mockClear();
  jest.mocked(retryHistoryReelExtraction).mockReset();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('처리 중 항목도 단건 조회 없이 3초 목록 폴링으로만 갱신한다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({
    reels: page([3], 'PROCESSING'),
    nextCursor: null,
  });
  const renderer = await render();
  expect(getHistoryReels).toHaveBeenCalledTimes(1);

  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(getHistoryReelDetail).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('폴링은 첫 페이지만 갱신하고 더 보기로 불러온 항목과 커서를 유지한다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  const secondCursor = {created_at: '2026-10-13T00:00:00Z', id: '1'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockResolvedValueOnce({reels: page([2, 1]), nextCursor: secondCursor})
    // 폴링: 새 항목 6이 생겨 첫 페이지가 6, 5, 4가 됐다.
    .mockResolvedValueOnce({reels: page([6, 5, 4]), nextCursor: firstCursor})
    .mockResolvedValue({reels: [], nextCursor: null});
  const renderer = await render();

  // 맨 아래까지 스크롤해 더 보기를 부른다.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScrollView).props.onScroll({
      nativeEvent: {
        contentOffset: {y: 1000},
        layoutMeasurement: {height: 800},
        contentSize: {height: 1000},
      },
    });
  });
  expect(getHistoryReels).toHaveBeenLastCalledWith(firstCursor);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);

  await tick(3000);
  expect(renderedIds(renderer)).toEqual(['6', '5', '4', '3', '2', '1']);

  // 폴링이 커서를 덮어쓰지 않았으므로 다음 더 보기는 두 번째 커서로 이어진다.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScrollView).props.onScroll({
      nativeEvent: {
        contentOffset: {y: 1200},
        layoutMeasurement: {height: 800},
        contentSize: {height: 1200},
      },
    });
  });
  expect(getHistoryReels).toHaveBeenLastCalledWith(secondCursor);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

const scrollToBottom = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScrollView).props.onScroll({
      nativeEvent: {
        contentOffset: {y: 1000},
        layoutMeasurement: {height: 800},
        contentSize: {height: 1000},
      },
    });
  });

test('끝까지 읽은 뒤에는 폴링이 커서를 되살리지 않아 이전 페이지를 다시 붙이지 않는다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    // 마지막 페이지라 다음 커서가 없다.
    .mockResolvedValueOnce({reels: page([2, 1]), nextCursor: null})
    // 폴링: 첫 페이지는 여전히 다음 페이지가 있다고 답한다.
    .mockResolvedValue({reels: page([5, 4, 3]), nextCursor: firstCursor});
  const renderer = await render();

  await scrollToBottom(renderer);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);

  await tick(3000);
  const callsAfterPoll = jest.mocked(getHistoryReels).mock.calls.length;
  await scrollToBottom(renderer);

  expect(jest.mocked(getHistoryReels).mock.calls).toHaveLength(callsAfterPoll);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('더 보기 중에 폴링이 끝나도 같은 커서로 다시 요청하지 않는다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  let resolveMore!: (value: Awaited<ReturnType<typeof getHistoryReels>>) => void;
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockImplementationOnce(() => new Promise(resolve => { resolveMore = resolve; }))
    .mockResolvedValue({reels: page([5, 4, 3]), nextCursor: firstCursor});
  const renderer = await render();

  await scrollToBottom(renderer);
  // 더 보기 응답을 기다리는 동안 폴링이 끝나고 다시 맨 아래에서 스크롤한다.
  await tick(3000);
  await scrollToBottom(renderer);

  const moreCalls = jest
    .mocked(getHistoryReels)
    .mock.calls.filter(([cursor]) => cursor === firstCursor);
  expect(moreCalls).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    resolveMore({reels: page([2, 1]), nextCursor: null});
  });
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('첫 페이지 밖의 항목도 목록의 공유 정보로 상세를 연다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockResolvedValueOnce({reels: page([2, 1]), nextCursor: null})
    .mockResolvedValue({reels: page([5, 4, 3]), nextCursor: firstCursor});
  const renderer = await render();
  await scrollToBottom(renderer);

  const olderItem = renderer.root.find(
    node => node.props.reel?.id === '1' && typeof node.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => olderItem.props.onPress());

  expect(getHistoryReelDetail).toHaveBeenCalledWith(
    expect.objectContaining({id: '1', processing_status: 'COMPLETED'}),
  );
  await ReactTestRenderer.act(async () => renderer.unmount());
});

const hasText = (renderer: ReactTestRenderer.ReactTestRenderer, text: string) =>
  renderer.root.findAll(node => node.props.children === text).length > 0;

test('목록이 보이는 중에 폴링이 실패하면 오류 화면 대신 목록을 유지한다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: null})
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({reels: page([6, 5, 4, 3]), nextCursor: null});
  const renderer = await render();

  await tick(3000);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3']);

  await tick(3000);
  expect(renderedIds(renderer)).toEqual(['6', '5', '4', '3']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('처음 불러오기에 실패하면 오류 화면을 보인다', async () => {
  jest.mocked(getHistoryReels).mockRejectedValue(new Error('offline'));
  const renderer = await render();

  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('이전 기록 불러오기가 실패하면 목록은 두고 아래에서 다시 불러온다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({reels: page([2, 1]), nextCursor: null})
    .mockResolvedValue({reels: page([5, 4, 3]), nextCursor: firstCursor});
  const renderer = await render();

  await scrollToBottom(renderer);
  expect(hasText(renderer, '이전 기록을 불러오지 못했어요.')).toBe(true);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3']);

  // 실패한 뒤에는 스크롤만으로 다시 요청하지 않는다.
  const callsAfterFailure = jest.mocked(getHistoryReels).mock.calls.length;
  await scrollToBottom(renderer);
  expect(jest.mocked(getHistoryReels).mock.calls).toHaveLength(callsAfterFailure);

  const retry = renderer.root.find(
    node =>
      typeof node.props.onPress === 'function' &&
      node.findAll(child => child.props.children === '다시 불러오기').length > 0,
  );
  await ReactTestRenderer.act(async () => retry.props.onPress());

  expect(getHistoryReels).toHaveBeenLastCalledWith(firstCursor);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
  expect(hasText(renderer, '이전 기록을 불러오지 못했어요.')).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

async function openFailureAndRetry(renderer: ReactTestRenderer.ReactTestRenderer) {
  const failed = renderer.root.find(
    node => node.props.reel?.id === '7' && typeof node.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => failed.props.onPress());
  const alertSpy = jest.spyOn(Alert, 'alert');
  const retryButton = renderer.root.find(
    node =>
      typeof node.props.onPress === 'function' &&
      node.findAll(child => child.props.children === '다시 시도하기').length > 0,
  );
  await ReactTestRenderer.act(async () => retryButton.props.onPress());
  const confirm = alertSpy.mock.calls[0][2]?.find(button => button.text === '확인');
  alertSpy.mockClear();
  await ReactTestRenderer.act(async () => {
    confirm?.onPress?.();
    await Promise.resolve();
  });
  return alertSpy;
}

test('재시도 접수에 성공하면 임시 카드 없이 목록으로 돌아가 바로 다시 읽는다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([7], 'FAILED'), nextCursor: null})
    .mockResolvedValue({
      reels: [reel(8, 'PROCESSING'), reel(7, 'FAILED')],
      nextCursor: null,
    });
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(retryHistoryReelExtraction).toHaveBeenCalledWith('7');
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(renderedIds(renderer)).toEqual(['8', '7']);
  expect(renderedIds(renderer).some(id => id.startsWith('retry-'))).toBe(false);
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('재시도가 접수되면 목록 조회를 기다리지 않고 실패 카드 내용으로 새 카드를 보여 준다', async () => {
  let finishListRequest!: (value: Awaited<ReturnType<typeof getHistoryReels>>) => void;
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([7], 'FAILED'), nextCursor: null})
    // 접수 뒤 목록 조회가 아직 끝나지 않았다.
    .mockImplementation(() => new Promise(resolve => { finishListRequest = resolve; }));
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(renderedIds(renderer)).toEqual(['8', '7']);
  const accepted = renderer.root.find(node => node.props.reel?.id === '8').props.reel;
  expect(accepted).toMatchObject({
    processing_status: 'PROCESSING',
    failure_reason: null,
    instagram_description: '게시물 7',
    instagram_thumbnail_url: 'https://cdn.example.com/7.jpg',
  });
  alertSpy.mockRestore();
  // 앱 공용 폴러의 진행 중 요청을 끝내 다음 테스트로 넘어가지 않게 한다.
  await ReactTestRenderer.act(async () => {
    finishListRequest({reels: [reel(8, 'PROCESSING'), reel(7, 'FAILED')], nextCursor: null});
  });
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('재시도 접수에 실패하면 실패 상세에 머문 채 안내한다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({
    reels: page([7], 'FAILED'),
    nextCursor: null,
  });
  jest.mocked(retryHistoryReelExtraction).mockRejectedValue(new Error('offline'));
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);

  expect(alertSpy).toHaveBeenCalledWith('다시 시도하지 못했어요', '잠시 후 다시 시도해주세요.');
  expect(
    renderer.root.findAll(node => node.props.children === '장소 분석에 실패했어요ㅠ').length,
  ).toBeGreaterThan(0);
  alertSpy.mockRestore();
  await ReactTestRenderer.act(async () => renderer.unmount());
});
