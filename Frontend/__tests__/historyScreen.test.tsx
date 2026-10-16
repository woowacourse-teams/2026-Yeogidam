import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {Alert, Image, Linking, ScrollView, StyleSheet, Text, View} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  toExtractionFailureType,
  trackExtractionRequestFinished,
  trackExtractionRequestStarted,
  trackHistoryContentDetailViewed,
  trackHistoryContentViewed,
  trackHistoryViewed,
} from '../src/analytics/placeExtractionEvents';
import {ReelApiError} from '../src/entities/content/errors';
import {deferred} from './support/deferred';
import {flushEffects, renderTracked} from './support/renderers';
import {
  getHistoryReelDetail,
  getHistoryReels,
  reportHistoryReel,
  retryHistoryReelExtraction,
} from '../src/entities/content/history-api';
import type {
  HistoryReel,
  HistoryReelDetail,
  SaveInstagramReelResponse,
} from '../src/entities/content/types';
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
  // 서버가 완료되지 않은 공유에 돌려주는 값처럼 장소 없는 상세를 돌려준다.
  getHistoryReelDetail: jest.fn((reel: object) => Promise.resolve({...reel, extraction: null})),
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

// 그린 화면이 남으면 폴러 구독이 다음 테스트에 섞이므로, renderTracked로 그려 테스트가 끝나면 setupFilesAfterEnv가 내리게 한다.
function render(props: Partial<React.ComponentProps<typeof HistoryScreen>> = {}) {
  return renderTracked(<HistoryScreen onBack={jest.fn()} {...props} />);
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
  jest.clearAllMocks();
  jest.mocked(getHistoryReels).mockReset();
  jest.mocked(getHistoryReelDetail).mockClear();
  jest.mocked(retryHistoryReelExtraction).mockReset();
  jest.mocked(reportHistoryReel).mockReset();
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
  await render();
  expect(getHistoryReels).toHaveBeenCalledTimes(1);

  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(getHistoryReelDetail).not.toHaveBeenCalled();
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
});

test('처음 불러오기에 실패하면 오류 화면을 보인다', async () => {
  jest.mocked(getHistoryReels).mockRejectedValue(new Error('offline'));
  const renderer = await render();

  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(true);
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
});

test('이전 기록 불러오기가 실패한 뒤 폴링이 커서를 비워도 다시 불러오기는 실패한 커서로 요청한다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockRejectedValueOnce(new Error('offline'))
    // 폴링: 첫 페이지가 더 읽을 페이지가 없다고 답해 리듀서가 커서를 비운다.
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: null})
    .mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();

  await scrollToBottom(renderer);
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);
  expect(hasText(renderer, '이전 기록을 불러오지 못했어요.')).toBe(true);

  await press(findButton(renderer, '다시 불러오기'));

  expect(getHistoryReels).toHaveBeenCalledTimes(4);
  expect(getHistoryReels).toHaveBeenLastCalledWith(firstCursor);
  expect(hasText(renderer, '히스토리를 불러오는 중이에요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
  expect(hasText(renderer, '이전 기록을 불러오지 못했어요.')).toBe(false);
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
});

// 아래는 화면을 훅과 컴포넌트로 나누기 전에 지금 동작을 고정하려고 더한 테스트다.

type Renderer = ReactTestRenderer.ReactTestRenderer;
type Node = ReactTestRenderer.ReactTestInstance;

const LAST_SEEN_HISTORY_KEY = '@yeogidam/last-seen-history-id';

const isHistoryItem = (node: Node) =>
  typeof node.props.onLayout === 'function' && node.props.reel !== undefined;

const historyItem = (renderer: Renderer, id: string) =>
  renderer.root.find(node => isHistoryItem(node) && node.props.reel.id === id);

// renderedIds와 달리 겹친 항목을 걸러 내지 않는다.
const renderedItemIds = (renderer: Renderer) =>
  renderer.root.findAll(isHistoryItem).map(node => node.props.reel.id as string);

const findButton = (renderer: Renderer, label: string) =>
  renderer.root.find(
    node =>
      typeof node.props.onPress === 'function' &&
      node.findAll(child => child.props.children === label).length > 0,
  );

const press = (node: Node) => ReactTestRenderer.act(async () => node.props.onPress());

const pressDetailBack = (renderer: Renderer) =>
  press(
    renderer.root.find(
      node =>
        node.props.accessibilityLabel === '히스토리 목록으로 돌아가기' &&
        typeof node.props.onPress === 'function',
    ),
  );

const scrollTo = (renderer: Renderer, y: number) =>
  ReactTestRenderer.act(async () => {
    renderer.root.findByType(ScrollView).props.onScroll({
      nativeEvent: {
        contentOffset: {y},
        layoutMeasurement: {height: 800},
        contentSize: {height: 3000},
      },
    });
  });

// 목록 ScrollView의 scrollTo 목이다. 목이 프로토타입에 있어 모든 ScrollView가 함께 쓴다.
const scrollToMock = (renderer: Renderer) =>
  renderer.root.findByType(ScrollView).instance.scrollTo as jest.Mock;

const storedSnapshots = () =>
  jest
    .mocked(AsyncStorage.setItem)
    .mock.calls.filter(([key]) => key === LAST_SEEN_HISTORY_KEY)
    .map(([, value]) => JSON.parse(value));

// 마지막으로 띄운 Alert의 확인 버튼을 누른다.
async function confirmAlert(alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>) {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2];
  const confirm = buttons?.find(button => button.text === '확인');
  await ReactTestRenderer.act(async () => {
    confirm?.onPress?.();
    await Promise.resolve();
  });
}

const detailOf = (base: HistoryReel, names: string[]): HistoryReelDetail => ({
  ...base,
  extraction: {
    extraction_places: names.map((name, index) => ({
      id: `place-${index}`,
      position: index,
      place: {
        id: `place-${index}`,
        name,
        category: null,
        source_address: null,
        road_address: `도로명 주소 ${index}`,
        address: null,
        latitude: null,
        longitude: null,
        kakao_place_url: null,
        thumbnail_url: null,
        photo_attribution: null,
      },
    })),
  },
});

test('첫 페이지를 불러오면 목록을 보이고, 맨 위 항목을 본 히스토리로 기록하고, 조회 지표를 한 번 남긴다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();

  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(getHistoryReels).toHaveBeenCalledWith();
  expect(hasText(renderer, '히스토리를 불러오는 중이에요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['2', '1']);
  // 폴러 구독 콜백과 첫 불러오기가 같은 결과를 각각 반영하므로 두 번 기록한다.
  expect(storedSnapshots()).toEqual([
    {id: '2', status: 'COMPLETED'},
    {id: '2', status: 'COMPLETED'},
  ]);

  // 조회 지표는 다음 프레임에 남긴다.
  expect(trackHistoryViewed).not.toHaveBeenCalled();
  await tick(0);
  expect(trackHistoryViewed).toHaveBeenCalledTimes(1);
  expect(trackHistoryViewed).toHaveBeenCalledWith(null, 'list');

  // 폴링으로 다시 읽어도 조회 지표는 다시 남기지 않는다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(trackHistoryViewed).toHaveBeenCalledTimes(1);
});

test('첫 페이지를 기다리는 동안 불러오는 중 문구만 보인다', async () => {
  const firstPage = deferred<Awaited<ReturnType<typeof getHistoryReels>>>();
  jest.mocked(getHistoryReels).mockReturnValueOnce(firstPage.promise);
  const renderer = await render();

  expect(hasText(renderer, '히스토리를 불러오는 중이에요.')).toBe(true);
  expect(hasText(renderer, '아직 공유된 콘텐츠가 없어요')).toBe(false);

  // 앱 공용 폴러의 진행 중 요청을 끝내 다음 테스트로 넘어가지 않게 한다.
  await ReactTestRenderer.act(async () => firstPage.resolve({reels: page([1]), nextCursor: null}));
  expect(hasText(renderer, '히스토리를 불러오는 중이에요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['1']);
});

test('첫 페이지가 비어 있으면 빈 화면을 보이고 empty 지표를 남긴다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: [], nextCursor: null});
  const renderer = await render();

  expect(hasText(renderer, '아직 공유된 콘텐츠가 없어요')).toBe(true);
  expect(storedSnapshots()).toEqual([]);
  await tick(0);
  expect(trackHistoryViewed).toHaveBeenCalledWith(null, 'empty');
});

test('처음 불러오기에 실패하면 error 지표를 남기고, 다시 시도로 목록을 불러온다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({reels: page([1]), nextCursor: null});
  const renderer = await render();

  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(true);
  await tick(0);
  expect(trackHistoryViewed).toHaveBeenCalledTimes(1);
  expect(trackHistoryViewed).toHaveBeenCalledWith(null, 'error');

  await press(findButton(renderer, '다시 시도'));

  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['1']);
  await tick(0);
  // 조회 지표는 화면마다 한 번만 남긴다.
  expect(trackHistoryViewed).toHaveBeenCalledTimes(1);
});

test('목록 머리의 뒤로 가기는 onBack을 부른다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([1]), nextCursor: null});
  const onBack = jest.fn();
  const renderer = await render({onBack});

  await press(
    renderer.root.find(
      node =>
        node.props.accessibilityLabel === '대기함으로 돌아가기' &&
        typeof node.props.onPress === 'function',
    ),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('이전 기록을 불러오는 동안 목록 아래에 불러오는 중 문구를 보인다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  const more = deferred<Awaited<ReturnType<typeof getHistoryReels>>>();
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockReturnValueOnce(more.promise);
  const renderer = await render();

  await scrollToBottom(renderer);
  expect(getHistoryReels).toHaveBeenLastCalledWith(firstCursor);
  expect(hasText(renderer, '이전 기록을 불러오는 중이에요.')).toBe(true);

  await ReactTestRenderer.act(async () => more.resolve({reels: page([2, 1]), nextCursor: null}));
  expect(hasText(renderer, '이전 기록을 불러오는 중이에요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
});

test('다시 그리기 전에 맨 아래 스크롤이 두 번 와도 이전 기록은 한 번만 요청한다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    .mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();

  const {onScroll} = renderer.root.findByType(ScrollView).props;
  const bottom = {
    nativeEvent: {
      contentOffset: {y: 1000},
      layoutMeasurement: {height: 800},
      contentSize: {height: 1000},
    },
  };
  await ReactTestRenderer.act(async () => {
    onScroll(bottom);
    onScroll(bottom);
  });

  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(renderedItemIds(renderer)).toEqual(['5', '4', '3', '2', '1']);
});

test('이전 기록과 폴링 결과에 이미 가진 항목이 다시 와도 한 번만 보인다', async () => {
  const firstCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([5, 4, 3]), nextCursor: firstCursor})
    // 첫 페이지 경계가 밀려 3이 다음 페이지에 다시 온다.
    .mockResolvedValueOnce({reels: page([3, 2, 1]), nextCursor: null})
    .mockResolvedValue({reels: page([6, 5, 4]), nextCursor: firstCursor});
  const renderer = await render();

  await scrollToBottom(renderer);
  expect(renderedItemIds(renderer)).toEqual(['5', '4', '3', '2', '1']);

  await tick(3000);
  expect(renderedItemIds(renderer)).toEqual(['6', '5', '4', '3', '2', '1']);
});

test('첫 페이지에 다음 커서가 없으면 맨 아래로 스크롤해도 더 요청하지 않는다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();

  await scrollToBottom(renderer);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(hasText(renderer, '이전 기록을 불러오는 중이에요.')).toBe(false);
});

test('목록 항목은 상태별 배지를 보이고, 정보가 덜 온 처리 중 항목은 뼈대로 보이며 누를 수 없다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({
    reels: [
      reel(4, 'COMPLETED'),
      reel(3, 'FAILED'),
      reel(2, 'PROCESSING'),
      {...reel(1, 'PENDING'), instagram_thumbnail_url: null},
    ],
    nextCursor: null,
  });
  const renderer = await render();

  expect(hasText(renderer, '성공')).toBe(true);
  expect(hasText(renderer, '실패')).toBe(true);
  expect(hasText(renderer, '처리중')).toBe(true);
  expect(
    renderer.root.findAll(node => node.props.accessibilityLabel === '새 히스토리를 불러오는 중')
      .length,
  ).toBeGreaterThan(0);
  expect(typeof historyItem(renderer, '4').props.onPress).toBe('function');
  expect(typeof historyItem(renderer, '3').props.onPress).toBe('function');
  expect(historyItem(renderer, '2').props.onPress).toBeUndefined();
  expect(historyItem(renderer, '1').props.onPress).toBeUndefined();
});

test('처리 상태마다 배지 문구와 테두리 색, 글자 색을 짝지어 보인다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({
    reels: [
      reel(4, 'COMPLETED'),
      reel(3, 'FAILED'),
      reel(2, 'PROCESSING'),
      reel(1, 'PENDING'),
      {...reel(0, 'PENDING'), instagram_thumbnail_url: null},
    ],
    nextCursor: null,
  });
  const renderer = await render();

  // 배지는 테두리가 있는 View이고, 뼈대 카드에는 배지가 없다.
  const badges = renderer.root
    .findAll(node => node.type === View && StyleSheet.flatten(node.props.style)?.borderWidth === 1)
    .map(badge => {
      const label = badge.findByType(Text);
      return {
        label: label.props.children,
        borderColor: StyleSheet.flatten(badge.props.style).borderColor,
        color: StyleSheet.flatten(label.props.style).color,
      };
    });
  expect(badges).toEqual([
    {label: '성공', borderColor: '#34c759', color: '#34c759'},
    {label: '실패', borderColor: '#fb6f6f', color: 'red'},
    {label: '처리중', borderColor: '#8e8e93', color: '#8e8e93'},
    {label: '처리중', borderColor: '#8e8e93', color: '#8e8e93'},
  ]);
});

test('항목을 만든 날짜별로 묶어 날짜 제목 아래에 보인다', async () => {
  // 시간대와 관계없이 같은 날짜가 나오도록 지역 시각으로 적는다.
  jest.mocked(getHistoryReels).mockResolvedValue({
    reels: [
      {...reel(3), created_at: '2026-10-15T12:00:00'},
      {...reel(2), created_at: '2026-10-15T09:00:00'},
      {...reel(1), created_at: '2026-10-14T12:00:00'},
    ],
    nextCursor: null,
  });
  const renderer = await render();

  const dates = renderer.root
    .findAll(node => node.type === Text && /^\d{4}\.\d{2}\.\d{2}$/.test(String(node.props.children)))
    .map(node => node.props.children);
  expect(dates).toEqual(['2026.10.15', '2026.10.14']);
  const idsUnder = (date: string) =>
    renderer.root
      .find(
        node =>
          node.type === View &&
          typeof node.props.onLayout === 'function' &&
          node.findAll(child => child.type === Text && child.props.children === date).length > 0,
      )
      .findAll(isHistoryItem)
      .map(node => node.props.reel.id);
  expect(idsUnder('2026.10.15')).toEqual(['3', '2']);
  expect(idsUnder('2026.10.14')).toEqual(['1']);
});

test('성공 항목을 누르면 장소 상세를 열고, 뒤로 가면 목록의 스크롤 위치로 돌아온다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const places = deferred<HistoryReelDetail>();
  jest.mocked(getHistoryReelDetail).mockReturnValueOnce(places.promise);
  const renderer = await render();

  await scrollTo(renderer, 300);
  await press(historyItem(renderer, '2'));

  expect(hasText(renderer, '장소 분석이 완료되었어요!')).toBe(true);
  expect(hasText(renderer, '장소를 확인하고 있어요.')).toBe(true);
  expect(hasText(renderer, '장소를 불러오는 중이에요.')).toBe(true);
  expect(trackHistoryContentDetailViewed).toHaveBeenCalledTimes(1);
  expect(trackHistoryContentDetailViewed).toHaveBeenCalledWith(null, '2', 'success');
  expect(getHistoryReelDetail).toHaveBeenCalledWith(expect.objectContaining({id: '2'}));

  await ReactTestRenderer.act(async () => places.resolve(detailOf(reel(2), ['성수 카페', '서울숲 식당'])));
  expect(hasText(renderer, '총 2개의 장소를 찾았어요')).toBe(true);
  expect(hasText(renderer, '성수 카페')).toBe(true);
  expect(hasText(renderer, '도로명 주소 1')).toBe(true);

  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await press(findButton(renderer, '원본 릴스로 이동'));
  expect(openURL).toHaveBeenCalledWith('https://www.instagram.com/reel/2/');
  openURL.mockRestore();

  await pressDetailBack(renderer);
  expect(renderedIds(renderer)).toEqual(['2', '1']);
  const restore = scrollToMock(renderer);
  expect(restore).not.toHaveBeenCalled();
  await tick(0);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(restore).toHaveBeenCalledWith({y: 300, animated: false});
});

test('성공 상세에서 장소를 불러오지 못하면 안내 문구를 보인다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2]), nextCursor: null});
  jest.mocked(getHistoryReelDetail).mockRejectedValueOnce(new Error('offline'));
  const renderer = await render();

  await press(historyItem(renderer, '2'));
  await flushEffects();
  expect(hasText(renderer, '장소를 불러오지 못했어요.')).toBe(true);
  expect(hasText(renderer, '총 0개의 장소를 찾았어요')).toBe(true);
});

test('실패 항목을 누르면 실패 이유를 보이고, 뒤로 가면 목록으로 돌아온다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([7], 'FAILED'), nextCursor: null});
  const renderer = await render();

  await press(historyItem(renderer, '7'));
  expect(hasText(renderer, '장소 분석에 실패했어요ㅠ')).toBe(true);
  expect(hasText(renderer, '지도에서 장소를 찾지 못했어요.')).toBe(true);
  expect(trackHistoryContentDetailViewed).toHaveBeenCalledWith(null, '7', 'failed');
  expect(getHistoryReelDetail).toHaveBeenCalledWith(expect.objectContaining({id: '7'}));

  await pressDetailBack(renderer);
  expect(renderedIds(renderer)).toEqual(['7']);
});

test('제보를 확인하면 제보 API를 부르고 버튼이 제보 완료로 바뀐다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([7], 'FAILED'), nextCursor: null});
  jest.mocked(reportHistoryReel).mockResolvedValue(undefined);
  const renderer = await render();
  await press(historyItem(renderer, '7'));

  const alertSpy = jest.spyOn(Alert, 'alert');
  await press(findButton(renderer, '제보하기'));
  expect(alertSpy).toHaveBeenCalledWith('제보할까요?', '', expect.any(Array));
  expect(reportHistoryReel).not.toHaveBeenCalled();

  await confirmAlert(alertSpy);
  expect(reportHistoryReel).toHaveBeenCalledWith('7');
  expect(hasText(renderer, '제보 완료')).toBe(true);
  expect(alertSpy).toHaveBeenCalledTimes(1);
  alertSpy.mockRestore();
});

test('제보에 실패하면 버튼을 되돌리고 안내한다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([7], 'FAILED'), nextCursor: null});
  jest.mocked(reportHistoryReel).mockRejectedValue(new Error('offline'));
  const renderer = await render();
  await press(historyItem(renderer, '7'));

  const alertSpy = jest.spyOn(Alert, 'alert');
  await press(findButton(renderer, '제보하기'));
  await confirmAlert(alertSpy);
  await flushEffects();

  expect(alertSpy).toHaveBeenLastCalledWith('제보하지 못했어요', '잠시 후 다시 시도해주세요.');
  expect(hasText(renderer, '제보하기')).toBe(true);
  expect(hasText(renderer, '제보 완료')).toBe(false);
  alertSpy.mockRestore();
});

test('재시도가 접수되면 추출 요청 지표와 본 히스토리를 남기고 이전 스크롤 위치로 되돌리지 않는다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([7], 'FAILED'), nextCursor: null})
    .mockResolvedValue({reels: [reel(8, 'PROCESSING'), reel(7, 'FAILED')], nextCursor: null});
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  const renderer = await render();
  await scrollTo(renderer, 300);

  const alertSpy = await openFailureAndRetry(renderer);
  await flushEffects();

  expect(trackExtractionRequestStarted).toHaveBeenCalledWith(null, {
    requestId: 'test-uuid',
    source: 'history_retry',
  });
  expect(trackExtractionRequestFinished).toHaveBeenCalledWith(null, {
    requestId: 'test-uuid',
    source: 'history_retry',
    outcome: 'response_received',
    contentId: '8',
  });
  // 첫 페이지(두 번), 재시도 접수, 접수 뒤 다시 읽은 첫 페이지 순서로 기록한다.
  expect(storedSnapshots()).toEqual([
    {id: '7', status: 'FAILED'},
    {id: '7', status: 'FAILED'},
    {id: '8', status: 'PROCESSING'},
    {id: '8', status: 'PROCESSING'},
  ]);
  expect(renderedIds(renderer)).toEqual(['8', '7']);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();

  // 접수 뒤 스크롤하지 않고 상세를 열었다 돌아오면 맨 위에 그대로 있다.
  await press(historyItem(renderer, '7'));
  await pressDetailBack(renderer);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('스크롤 없이 상세에서 돌아오면 복원 표시를 지워, 나중에 항목 수가 바뀌어도 스크롤을 옮기지 않는다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([2, 1]), nextCursor: null})
    .mockResolvedValue({reels: page([3, 2, 1]), nextCursor: null});
  const renderer = await render();

  await press(historyItem(renderer, '2'));
  await pressDetailBack(renderer);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();

  await scrollTo(renderer, 500);
  await tick(3000);
  expect(renderedIds(renderer)).toEqual(['3', '2', '1']);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();
});

test('빈 목록에서 폴링이 실패하면 오류 화면을 보이고, 다음 폴링이 성공하면 목록을 보인다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: [], nextCursor: null})
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({reels: page([1]), nextCursor: null});
  const renderer = await render();
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);

  await tick(3000);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(true);

  await tick(3000);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['1']);
});

test('재시도 접수 뒤 다시 읽기가 실패해도 목록을 유지하고 다음 폴링 결과를 보인다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([7], 'FAILED'), nextCursor: null})
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({reels: [reel(8, 'PROCESSING'), reel(7, 'FAILED')], nextCursor: null});
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);
  await flushEffects();
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['8', '7']);

  await tick(3000);
  expect(renderedIds(renderer)).toEqual(['8', '7']);
  expect(hasText(renderer, '히스토리를 불러오지 못했어요.')).toBe(false);
  alertSpy.mockRestore();
});

test('스크롤 없이 상세에서 돌아와 남은 복원 표시도 재시도 접수가 지워 이후 목록이 바뀌어도 스크롤을 옮기지 않는다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: [reel(7, 'FAILED'), reel(6)], nextCursor: null})
    .mockResolvedValueOnce({reels: [reel(8, 'PROCESSING'), reel(7, 'FAILED'), reel(6)], nextCursor: null})
    .mockResolvedValue({
      reels: [reel(9), reel(8, 'PROCESSING'), reel(7, 'FAILED'), reel(6)],
      nextCursor: null,
    });
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '8',
    status: 'PROCESSING',
    reused: false,
  });
  const renderer = await render();

  // 맨 위에서 상세를 열고 돌아오면 되돌릴 위치가 없어 복원 표시가 남는다.
  await press(historyItem(renderer, '6'));
  await pressDetailBack(renderer);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();

  await scrollTo(renderer, 300);
  const alertSpy = await openFailureAndRetry(renderer);
  await flushEffects();
  expect(renderedIds(renderer)).toEqual(['8', '7', '6']);

  // 접수 뒤 아래로 스크롤한 상태에서 폴링으로 항목 수가 바뀌어도 스크롤을 옮기지 않는다.
  await scrollTo(renderer, 500);
  await tick(3000);
  expect(renderedIds(renderer)).toEqual(['9', '8', '7', '6']);
  await tick(0);
  expect(scrollToMock(renderer)).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('이미 있는 공유로 재시도가 접수되면 임시 카드 없이 목록 조회 결과를 기다린다', async () => {
  const list = deferred<Awaited<ReturnType<typeof getHistoryReels>>>();
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce({reels: page([7], 'FAILED'), nextCursor: null})
    .mockReturnValueOnce(list.promise)
    .mockResolvedValue({reels: [reel(9), reel(7, 'FAILED')], nextCursor: null});
  jest.mocked(retryHistoryReelExtraction).mockResolvedValue({
    reelId: '9',
    status: 'COMPLETED',
    reused: true,
  });
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);
  await flushEffects();
  expect(hasText(renderer, '장소 분석에 실패했어요ㅠ')).toBe(false);
  expect(renderedIds(renderer)).toEqual(['7']);

  await ReactTestRenderer.act(async () =>
    list.resolve({reels: [reel(9), reel(7, 'FAILED')], nextCursor: null}),
  );
  expect(renderedIds(renderer)).toEqual(['9', '7']);
  alertSpy.mockRestore();
});

test('재시도 접수를 기다리는 동안 진행 문구를 보이고, 실패를 지표로 남긴 뒤 MEDIA 오류는 서버 문구로 안내한다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([7], 'FAILED'), nextCursor: null});
  const accepted = deferred<SaveInstagramReelResponse>();
  jest.mocked(retryHistoryReelExtraction).mockReturnValue(accepted.promise);
  const renderer = await render();

  const alertSpy = await openFailureAndRetry(renderer);
  expect(hasText(renderer, '다시 시도하는 중...')).toBe(true);
  expect(trackExtractionRequestStarted).toHaveBeenCalledTimes(1);

  const error = new ReelApiError({
    errorCode: 'MEDIA400_010',
    message: '서버가 내려 준 안내 문구',
    status: 400,
  });
  await ReactTestRenderer.act(async () => accepted.reject(error));
  await flushEffects();

  expect(toExtractionFailureType).toHaveBeenCalledWith(error);
  expect(trackExtractionRequestFinished).toHaveBeenCalledWith(null, {
    requestId: 'test-uuid',
    source: 'history_retry',
    outcome: 'request_failed',
    failureType: 'unknown',
    responseStatus: 400,
  });
  expect(alertSpy).toHaveBeenCalledWith('다시 시도하지 못했어요', '서버가 내려 준 안내 문구');
  expect(hasText(renderer, '다시 시도하기')).toBe(true);
  expect(hasText(renderer, '장소 분석에 실패했어요ㅠ')).toBe(true);
  alertSpy.mockRestore();
});

test('비회원은 API 없이 체험 목록과 체험 상세를 보인다', async () => {
  const renderer = await render({
    guestReels: [reel(11), reel(10, 'FAILED')],
    guestDetails: {'11': detailOf(reel(11), ['성수 카페'])},
  });

  expect(renderedIds(renderer)).toEqual(['11', '10']);
  await tick(3000);
  expect(getHistoryReels).not.toHaveBeenCalled();
  expect(trackHistoryViewed).not.toHaveBeenCalled();
  expect(storedSnapshots()).toEqual([]);

  await press(historyItem(renderer, '11'));
  expect(hasText(renderer, '총 1개의 장소를 찾았어요')).toBe(true);
  expect(hasText(renderer, '성수 카페')).toBe(true);
  expect(getHistoryReelDetail).not.toHaveBeenCalled();
  expect(trackHistoryContentDetailViewed).toHaveBeenCalledWith(null, '11', 'success');
});

test('비회원이 실패 상세에서 다시 시도하거나 제보하면 확인 창 없이 로그인을 요청한다', async () => {
  const onRequireLogin = jest.fn();
  const alertSpy = jest.spyOn(Alert, 'alert');
  const renderer = await render({
    guestReels: [reel(10, 'FAILED')],
    guestDetails: {},
    onRequireLogin,
  });

  await press(historyItem(renderer, '10'));
  expect(hasText(renderer, '지도에서 장소를 찾지 못했어요.')).toBe(true);
  await press(findButton(renderer, '다시 시도하기'));
  await press(findButton(renderer, '제보하기'));

  expect(onRequireLogin).toHaveBeenCalledTimes(2);
  expect(alertSpy).not.toHaveBeenCalled();
  expect(retryHistoryReelExtraction).not.toHaveBeenCalled();
  expect(reportHistoryReel).not.toHaveBeenCalled();
  expect(getHistoryReelDetail).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('비회원 실패 상세는 목록 카드처럼 앱에 들어 있는 체험 그림을 썸네일로 보인다', async () => {
  // require()로 읽은 그림은 번호로 온다.
  const bundledImage = 42;
  const renderer = await render({
    guestReels: [{...reel(10, 'FAILED'), local_thumbnail_source: bundledImage}],
    guestDetails: {},
  });
  expect(historyItem(renderer, '10').findByType(Image).props.source).toBe(bundledImage);

  await press(historyItem(renderer, '10'));
  expect(hasText(renderer, '장소 분석에 실패했어요ㅠ')).toBe(true);
  expect(renderer.root.findByType(Image).props.source).toBe(bundledImage);
});

// 목록 높이와 날짜 묶음, 카드 위치를 차례로 알린다. 카드는 위에서부터 94 높이로 쌓인다.
async function layoutList(renderer: Renderer, viewportHeight: number) {
  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByType(ScrollView)
      .props.onLayout({nativeEvent: {layout: {height: viewportHeight}}});
    renderer.root
      .find(
        node =>
          node.type === View &&
          typeof node.props.onLayout === 'function' &&
          node.findAll(isHistoryItem).length > 0,
      )
      .props.onLayout({nativeEvent: {layout: {y: 0}}});
    renderedIds(renderer).forEach((id, index) =>
      historyItem(renderer, id).props.onLayout({
        nativeEvent: {layout: {y: 30 + index * 94, height: 94}},
      }),
    );
  });
}

test('절반 넘게 보인 카드는 0.5초 뒤 한 번만 노출 지표를 남긴다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();
  await layoutList(renderer, 800);

  await tick(499);
  expect(trackHistoryContentViewed).not.toHaveBeenCalled();
  await tick(1);
  expect(jest.mocked(trackHistoryContentViewed).mock.calls).toEqual([
    [null, '2', 'success'],
    [null, '1', 'success'],
  ]);

  // 폴링으로 같은 항목이 다시 와도 같은 상태는 다시 남기지 않는다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  await tick(500);
  expect(trackHistoryContentViewed).toHaveBeenCalledTimes(2);
});

test('0.5초 안에 화면 밖으로 스크롤된 카드는 노출 지표를 남기지 않는다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();
  await layoutList(renderer, 800);

  await tick(300);
  await scrollTo(renderer, 1000);
  await tick(500);
  expect(trackHistoryContentViewed).not.toHaveBeenCalled();
});

test('상세를 열면 기다리던 노출 지표를 취소하고, 목록으로 돌아오면 이전 배치로 다시 판단한다', async () => {
  jest.mocked(getHistoryReels).mockResolvedValue({reels: page([2, 1]), nextCursor: null});
  const renderer = await render();
  await layoutList(renderer, 800);

  await tick(300);
  await press(historyItem(renderer, '2'));
  await tick(500);
  expect(trackHistoryContentViewed).not.toHaveBeenCalled();

  await pressDetailBack(renderer);
  await tick(500);
  expect(jest.mocked(trackHistoryContentViewed).mock.calls).toEqual([
    [null, '2', 'success'],
    [null, '1', 'success'],
  ]);
});
