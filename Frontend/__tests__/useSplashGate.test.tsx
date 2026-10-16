import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useSplashGate} from '../src/app/useSplashGate';
import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
} from '../src/lib/app-guide-storage';

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

async function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(hasCompletedAppGuide).mockResolvedValue(false);
  jest.mocked(hasSignedInOnThisInstall).mockResolvedValue(false);
  refreshUpdatePolicy.mockClear();
  jest.mocked(completeAppGuide).mockClear();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('저장소를 다 읽어도 최소 시간이 지나기 전에는 스플래시를 보이고, 지나면 내린다', async () => {
  const renderer = await render();
  expect(latest.isSplashVisible).toBe(true);
  expect(latest.hasCompletedGuide).toBe(false);
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
  await act(async () => renderer.unmount());
});

test('이 설치에서 로그인한 적이 있으면 안내를 마친 것으로 본다', async () => {
  jest.mocked(hasSignedInOnThisInstall).mockResolvedValue(true);
  const renderer = await render();
  expect(latest.hasCompletedGuide).toBe(true);
  await act(async () => renderer.unmount());
});

test('안내를 마치면 저장이 끝나기 전에 마친 상태가 되고 저장소에 기록한다', async () => {
  const saving = deferred<void>();
  jest.mocked(completeAppGuide).mockReturnValue(saving.promise);
  const renderer = await render();
  await act(async () => {
    latest.completeGuide();
  });
  expect(latest.hasCompletedGuide).toBe(true);
  expect(completeAppGuide).toHaveBeenCalledTimes(1);
  saving.resolve();
  await act(async () => renderer.unmount());
});

test('저장소 읽기가 최소 시간보다 늦으면 읽기가 끝날 때까지 스플래시를 둔다', async () => {
  const guide = deferred<boolean>();
  jest.mocked(hasCompletedAppGuide).mockReturnValue(guide.promise);
  const renderer = await render();

  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(true);
  expect(latest.hasCompletedGuide).toBeNull();

  guide.resolve(true);
  await act(async () => {
    await Promise.resolve();
  });
  expect(latest.hasCompletedGuide).toBe(true);
  expect(latest.isSplashVisible).toBe(false);
  await act(async () => renderer.unmount());
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
}
