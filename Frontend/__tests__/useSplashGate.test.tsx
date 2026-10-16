import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useSplashGate} from '../src/app/useSplashGate';
import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
} from '../src/lib/app-guide-storage';
import {deferred} from './support/deferred';

jest.mock('../src/lib/app-guide-storage', () => ({
  completeAppGuide: jest.fn(() => Promise.resolve()),
  hasCompletedAppGuide: jest.fn(),
  hasSignedInOnThisInstall: jest.fn(),
}));

type Snapshot = ReturnType<typeof useSplashGate>;
let latest: Snapshot;
const refreshUpdatePolicy = jest.fn(() => Promise.resolve());

function Harness() {
  latest = useSplashGate(refreshUpdatePolicy);
  return null;
}

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(hasCompletedAppGuide).mockResolvedValue(false);
  jest.mocked(hasSignedInOnThisInstall).mockResolvedValue(false);
  refreshUpdatePolicy.mockClear();
  jest.mocked(completeAppGuide).mockClear();
});

// 단언이 중간에 실패해도 그린 훅과 타이머가 다음 테스트로 넘어가지 않게 여기서 정리합니다.
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await act(async () => renderer.unmount());
  }
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('저장소를 다 읽어도 최소 시간이 지나기 전에는 스플래시를 보이고, 지나면 내린다', async () => {
  await render();
  expect(latest.isSplashVisible).toBe(true);
  expect(latest.guideStatus).toBe('required');
  expect(refreshUpdatePolicy).toHaveBeenCalledTimes(1);

  await act(async () => {
    jest.advanceTimersByTime(1999);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(true);

  await act(async () => {
    jest.advanceTimersByTime(1);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(false);
});

test('이 설치에서 로그인한 적이 있으면 안내를 마친 것으로 본다', async () => {
  jest.mocked(hasSignedInOnThisInstall).mockResolvedValue(true);
  await render();
  expect(latest.guideStatus).toBe('completed');
});

test('안내를 마치면 저장이 끝나기 전에 마친 상태가 되고 저장소에 기록한다', async () => {
  const saving = deferred<void>();
  jest.mocked(completeAppGuide).mockReturnValue(saving.promise);
  await render();
  await act(async () => {
    latest.completeGuide();
  });
  expect(latest.guideStatus).toBe('completed');
  expect(completeAppGuide).toHaveBeenCalledTimes(1);
  saving.resolve();
});

test('저장소 읽기가 최소 시간보다 늦으면 읽기가 끝날 때까지 스플래시를 둔다', async () => {
  const guide = deferred<boolean>();
  jest.mocked(hasCompletedAppGuide).mockReturnValue(guide.promise);
  await render();

  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(true);
  expect(latest.guideStatus).toBe('loading');

  guide.resolve(true);
  await act(async () => {
    await Promise.resolve();
  });
  expect(latest.guideStatus).toBe('completed');
  expect(latest.isSplashVisible).toBe(false);
});
