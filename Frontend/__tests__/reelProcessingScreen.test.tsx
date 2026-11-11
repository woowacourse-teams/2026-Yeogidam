import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {getHistoryReels} from '../src/entities/content/history-api';
import type {HistoryReel} from '../src/entities/content/types';
import {
  estimateProcessingProgress,
  getProcessingBackGestureRegion,
  isReelInProgress,
  ReelProcessingScreen,
} from '../src/pages/reel-processing/ReelProcessingScreen';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
}));

const reel = (
  status: HistoryReel['processing_status'] = 'PROCESSING',
): HistoryReel => ({
  id: '8',
  instagram_url: 'https://www.instagram.com/reel/abc/',
  instagram_title: null,
  instagram_description: '더 추워지기 전에 야장 타코 즐기러 가요',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: 'https://cdn.example.com/8.jpg',
  processing_status: status,
  failure_reason: null,
  save_mode: null,
  created_at: new Date().toISOString(),
});

const texts = (renderer: ReactTestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(Text).map(node =>
    React.Children.toArray(node.props.children)
      .filter(child => typeof child === 'string' || typeof child === 'number')
      .join(''),
  );

async function render(
  current: HistoryReel,
  handlers: {
    onBack?: jest.Mock;
    onCompleted?: jest.Mock;
    onFailed?: jest.Mock;
  } = {},
) {
  const props = {
    onBack: handlers.onBack ?? jest.fn(),
    onCompleted: handlers.onCompleted ?? jest.fn(),
    onFailed: handlers.onFailed ?? jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ReelProcessingScreen reel={current} {...props} />,
    );
  });
  return {renderer, ...props};
}

beforeEach(() => {
  jest.useFakeTimers();
  // 서버 목록에는 아직 같은 상태로 남아 있다(진행 중).
  jest.mocked(getHistoryReels).mockReset().mockResolvedValue({
    reels: [reel('PROCESSING')],
    nextCursor: null,
  });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('estimateProcessingProgress', () => {
  test('최소 3%에서 시작해 늘어나되 95%를 넘지 않는다', () => {
    expect(estimateProcessingProgress(0)).toBe(3);
    expect(estimateProcessingProgress(-1000)).toBe(3);
    const samples = [0, 5_000, 15_000, 40_000, 120_000, 3_600_000].map(
      estimateProcessingProgress,
    );
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(samples[samples.length - 1]).toBe(95);
  });
});

test('처리 중·대기 중인 공유만 진행 화면 대상이다', () => {
  expect(isReelInProgress(reel('PROCESSING'))).toBe(true);
  expect(isReelInProgress(reel('PENDING'))).toBe(true);
  expect(isReelInProgress(reel('COMPLETED'))).toBe(false);
  expect(isReelInProgress(reel('FAILED'))).toBe(false);
  expect(getProcessingBackGestureRegion()).toEqual({top: 130, bottom: 0});
});

test('처리 중이면 공유한 릴스 제목과 진행률을 보여 준다', async () => {
  const {renderer} = await render(reel('PROCESSING'));
  const all = texts(renderer);

  expect(all).toContain('공유한 릴스');
  expect(all).toContain('더 추워지기 전에 야장 타코 즐기러 가요');
  expect(all).toContain('보관함에서 기다리기');
  expect(all).toContain('릴스 살펴보는 중… ');
  expect(all.some(text => /^\d+%$/.test(text))).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('대기 중이면 순서를 기다리는 문구를 보이고 진행률은 숨긴다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValue({reels: [reel('PENDING')], nextCursor: null});
  const {renderer} = await render(reel('PENDING'));
  const all = texts(renderer);

  expect(all.some(text => text.includes('순서를 기다리는 중'))).toBe(true);
  expect(all.some(text => /^\d+%$/.test(text))).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('이전 버튼과 "보관함에서 기다리기"는 모두 이전 화면으로 돌아간다', async () => {
  const {renderer, onBack} = await render(reel());

  await ReactTestRenderer.act(async () =>
    renderer.root
      .findByProps({accessibilityLabel: '이전 화면으로 돌아가기'})
      .props.onPress(),
  );
  await ReactTestRenderer.act(async () =>
    renderer.root
      .findByProps({accessibilityLabel: '보관함에서 기다리기'})
      .props.onPress(),
  );
  expect(onBack).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('분석이 끝나면 최신 공유 정보로 완료를 알린다(한 번만)', async () => {
  const done = {...reel('COMPLETED'), instagram_thumbnail_url: 'https://cdn.example.com/done.jpg'};
  jest
    .mocked(getHistoryReels)
    .mockResolvedValue({reels: [done], nextCursor: null});
  const {renderer, onCompleted, onFailed} = await render(reel('PROCESSING'));

  expect(onCompleted).toHaveBeenCalledTimes(1);
  expect(onCompleted).toHaveBeenCalledWith(
    expect.objectContaining({id: '8', processing_status: 'COMPLETED'}),
  );
  expect(onFailed).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(9000);
    await Promise.resolve();
  });
  expect(onCompleted).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('분석에 실패하면 히스토리로 보내지 않고 화면 안에서 실패를 알린다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValue({reels: [reel('FAILED')], nextCursor: null});
  const {renderer, onCompleted, onFailed} = await render(reel('PROCESSING'));

  // 자동으로 넘어가지 않는다.
  expect(onFailed).not.toHaveBeenCalled();
  expect(onCompleted).not.toHaveBeenCalled();
  const all = texts(renderer);
  expect(all).toContain('릴스에서 장소를 찾지 못했어요');
  expect(all.some(text => text.includes('릴스 살펴보는 중'))).toBe(false);
  expect(all.some(text => /^\d+%$/.test(text))).toBe(false);

  // 버튼을 눌러야 히스토리로 간다.
  await ReactTestRenderer.act(async () =>
    renderer.root
      .findByProps({accessibilityLabel: '히스토리에서 확인하기'})
      .props.onPress(),
  );
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(onFailed).toHaveBeenCalledWith(
    expect.objectContaining({id: '8', processing_status: 'FAILED'}),
  );
  await ReactTestRenderer.act(async () => renderer.unmount());
});
