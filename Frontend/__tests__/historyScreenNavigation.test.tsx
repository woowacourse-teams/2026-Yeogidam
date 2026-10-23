import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {SwipeBackStack} from '../src/components/navigation/SwipeBackStack';
import {getHistoryReels} from '../src/entities/content/history-api';
import type {HistoryReel} from '../src/entities/content/types';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {mockAndroidBackHandler} from './support/androidBackHandler';
import {pressLabel} from './support/pressLabel';
import {renderTracked, settleAsyncWork, type Renderer} from './support/renderers';

// 히스토리 화면이 App의 화면 이력(뒤로 가기)과 어떻게 이어지는지와, 보이지 않는 동안 목록 폴링을 멈추는지 확인합니다.
// 목록과 상세의 내용은 historyScreen.test.tsx가 맡습니다.

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
  getHistoryReelDetail: jest.fn(requestedReel => Promise.resolve({...requestedReel, extraction: null})),
  reportHistoryReel: jest.fn(),
  retryHistoryReelExtraction: jest.fn(),
}));

const act = ReactTestRenderer.act;

const reel = (id: number): HistoryReel => ({
  id: String(id),
  instagram_url: `https://www.instagram.com/reel/${id}/`,
  instagram_title: null,
  instagram_description: `게시물 ${id}`,
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-15T00:00:00Z',
});

type ScreenProps = React.ComponentProps<typeof HistoryScreen>;

function render(props: Partial<ScreenProps> = {}) {
  return renderTracked(<HistoryScreen onBack={jest.fn()} {...props} />);
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

const stack = (renderer: Renderer) => renderer.root.findByType(SwipeBackStack).props;
/** 목록 카드(onLayout과 reel을 받는 요소)를 눌러 성공 상세를 엽니다. */
async function openFirstReel(renderer: Renderer) {
  const card = renderer.root.find(
    node => typeof node.props.onLayout === 'function' && node.props.reel?.id === '2',
  );
  await act(async () => card.props.onPress());
  await settleAsyncWork();
}
const lastBackState = (onNestedBackStateChange: jest.Mock) =>
  onNestedBackStateChange.mock.calls[onNestedBackStateChange.mock.calls.length - 1][0];

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(getHistoryReels).mockReset().mockResolvedValue({reels: [reel(2), reel(1)], nextCursor: null});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('상세를 열면 이력 스택에 상세가 쌓이고 뒤로 갈 수 있다고 알리며, 스와이프 뒤로 가기로 목록에 돌아오면 아니라고 알린다', async () => {
  const onNestedBackStateChange = jest.fn();
  const renderer = await render({onNestedBackStateChange});
  await settleAsyncWork();
  expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null, enabled: true});
  expect(lastBackState(onNestedBackStateChange)).toBe(false);

  await openFirstReel(renderer);
  expect(stack(renderer)).toMatchObject({activeKey: 'detail', backKey: 'list'});
  expect(lastBackState(onNestedBackStateChange)).toBe(true);

  await act(async () => stack(renderer).onBack());
  expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null});
  expect(lastBackState(onNestedBackStateChange)).toBe(false);
});

test('화면이 보이지 않으면 상세가 열려 있어도 뒤로 갈 수 있다고 알리지 않고 스와이프도 끈다', async () => {
  const onNestedBackStateChange = jest.fn();
  const renderer = await render({onNestedBackStateChange});
  await settleAsyncWork();
  await openFirstReel(renderer);
  expect(lastBackState(onNestedBackStateChange)).toBe(true);

  await act(async () => {
    renderer.update(<HistoryScreen onBack={jest.fn()} onNestedBackStateChange={onNestedBackStateChange} isActive={false} />);
  });
  expect(lastBackState(onNestedBackStateChange)).toBe(false);
  expect(stack(renderer).enabled).toBe(false);
});

test('화면이 보이지 않는 동안에는 목록 폴링을 멈추고, 다시 보이면 다시 폴링한다', async () => {
  const renderer = await render();
  await settleAsyncWork();
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);

  await act(async () => {
    renderer.update(<HistoryScreen onBack={jest.fn()} isActive={false} />);
  });
  await tick(6000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);

  await act(async () => {
    renderer.update(<HistoryScreen onBack={jest.fn()} isActive />);
  });
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);
});

test('비회원 빈 히스토리의 로그인하기는 onRequireLogin을 부르고, 회원 빈 히스토리에는 로그인 버튼이 없다', async () => {
  const onRequireLogin = jest.fn();
  const guest = await render({guestReels: [], onRequireLogin});
  await settleAsyncWork();
  await pressLabel(guest, '히스토리 로그인');
  expect(onRequireLogin).toHaveBeenCalledTimes(1);

  jest.mocked(getHistoryReels).mockResolvedValue({reels: [], nextCursor: null});
  const member = await render();
  await settleAsyncWork();
  expect(JSON.stringify(member.toJSON())).toContain('인스타그램 릴스를 공유하고 장소 추출 결과를');
  expect(
    member.root.findAll(node => node.props.accessibilityLabel === '히스토리 로그인'),
  ).toHaveLength(0);
});

test('Android에서는 상세가 열려 있을 때만 시스템 뒤로 가기를 가로채 목록으로 돌아가고, 목록에서는 처리기를 걸지 않는다', async () => {
  const {handlers, pressBack} = mockAndroidBackHandler();
  const renderer = await render();
  await settleAsyncWork();
  expect(handlers).toHaveLength(0);

  await openFirstReel(renderer);
  expect(handlers).toHaveLength(1);
  let handled!: boolean;
  await act(async () => {
    handled = pressBack();
  });
  expect(handled).toBe(true);
  expect(stack(renderer).activeKey).toBe('list');
  expect(handlers).toHaveLength(0);
});
