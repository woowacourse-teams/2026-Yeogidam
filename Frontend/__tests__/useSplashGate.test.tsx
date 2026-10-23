import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useSplashGate} from '../src/app/useSplashGate';
import {deferred} from './support/deferred';
import {renderTracked} from './support/renderers';

type Snapshot = ReturnType<typeof useSplashGate>;
let latest: Snapshot;
const refreshUpdatePolicy = jest.fn(() => Promise.resolve());

function Harness() {
  latest = useSplashGate(refreshUpdatePolicy);
  return null;
}

const act = ReactTestRenderer.act;
const render = () => renderTracked(<Harness />);

beforeEach(() => {
  jest.useFakeTimers();
  refreshUpdatePolicy.mockReset().mockResolvedValue(undefined);
});

// 단언이 중간에 실패해도 타이머가 다음 테스트로 넘어가지 않게 여기서 되돌립니다. 그린 훅은 setupFilesAfterEnv가 먼저 내립니다.
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('업데이트 정책을 다 읽어도 최소 시간이 지나기 전에는 스플래시를 보이고, 지나면 내린다', async () => {
  await render();
  expect(latest.isSplashVisible).toBe(true);
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

test('업데이트 정책 읽기가 최소 시간보다 늦으면 읽기가 끝날 때까지 스플래시를 둔다', async () => {
  const policy = deferred<void>();
  refreshUpdatePolicy.mockReturnValue(policy.promise);
  await render();

  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(true);

  policy.resolve();
  await act(async () => {
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(false);
});

test('업데이트 정책 읽기가 실패해도 최소 시간이 지나면 스플래시를 내린다', async () => {
  refreshUpdatePolicy.mockRejectedValue(new Error('offline'));
  await render();

  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
  expect(latest.isSplashVisible).toBe(false);
});
