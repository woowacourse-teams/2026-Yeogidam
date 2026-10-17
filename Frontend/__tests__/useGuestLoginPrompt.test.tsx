import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';

import {useGuestLoginPrompt} from '../src/app/useGuestLoginPrompt';
import {renderTracked} from './support/renderers';

type Props = {isGuestBrowsing: boolean; isMember: boolean};
let latest: ReturnType<typeof useGuestLoginPrompt>;
let emitAppState: (state: AppStateStatus) => void;

function Harness(props: Props) {
  latest = useGuestLoginPrompt(props);
  return null;
}

const act = ReactTestRenderer.act;
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const appState = (state: AppStateStatus) => act(async () => emitAppState(state));

async function render(props: Props) {
  const renderer = await renderTracked(<Harness {...props} />);
  return (next: Props) => act(async () => renderer.update(<Harness {...next} />));
}

// jest preset의 AppState mock에서 테스트가 바꾸는 두 값을 잡아 둡니다. currentState는 값이 jest.fn()이라 jest.replaceProperty를 쓸 수 없어
// Object.defineProperty로 되돌립니다. addEventListener는 기본 구현을 가진 jest.fn()이라 spyOn이 같은 mock을 돌려주고
// mockRestore는 기본 구현까지 지우므로, afterEach가 잡아 둔 구현을 다시 넣습니다.
const presetCurrentState = AppState.currentState;
const presetAddEventListener = jest.mocked(AppState.addEventListener).getMockImplementation();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  Object.defineProperty(AppState, 'currentState', {value: 'active', configurable: true});
  jest.mocked(AppState.addEventListener).mockImplementation((_type, handler) => {
    emitAppState = handler;
    return {remove: jest.fn()};
  });
});

// 단언이 중간에 실패해도 바꾼 AppState와 가짜 타이머가 다음 테스트로 넘어가지 않게 되돌립니다. 그린 훅은 setupFilesAfterEnv가 먼저 내립니다.
afterEach(() => {
  Object.defineProperty(AppState, 'currentState', {value: presetCurrentState, configurable: true});
  jest.mocked(AppState.addEventListener).mockReset().mockImplementation(presetAddEventListener);
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('포그라운드에서 둘러본 시간만 3분을 채우면 띄우고, 백그라운드 동안은 숨기며, 닫으면 다시 띄우지 않는다', async () => {
  await render({isGuestBrowsing: true, isMember: false});

  await advance(120_000);
  await appState('background');
  await advance(300_000);
  await appState('active');
  await advance(59_999);
  expect(latest.isGuestLoginPromptVisible).toBe(false);

  await advance(1);
  expect(latest.isGuestLoginPromptVisible).toBe(true);

  await appState('background');
  expect(latest.isGuestLoginPromptVisible).toBe(false);
  await appState('active');
  expect(latest.isGuestLoginPromptVisible).toBe(true);

  await act(async () => latest.dismissGuestLoginPrompt());
  await advance(180_000);
  expect(latest.isGuestLoginPromptVisible).toBe(false);
});

test('3분 전에 회원이 되면 로그아웃 뒤 다시 둘러봐도 띄우지 않는다', async () => {
  const rerender = await render({isGuestBrowsing: true, isMember: false});

  await advance(90_000);
  await rerender({isGuestBrowsing: false, isMember: true});
  await rerender({isGuestBrowsing: true, isMember: false});
  await advance(180_000);

  expect(latest.isGuestLoginPromptVisible).toBe(false);
});
