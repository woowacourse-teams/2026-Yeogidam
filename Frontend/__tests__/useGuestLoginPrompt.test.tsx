import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';

import {useGuestLoginPrompt} from '../src/app/useGuestLoginPrompt';

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
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness {...props} />);
  });
  return (next: Props) => act(async () => renderer.update(<Harness {...next} />));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  Object.defineProperty(AppState, 'currentState', {value: 'active', configurable: true});
  jest.mocked(AppState.addEventListener).mockImplementation((_type, handler) => {
    emitAppState = handler;
    return {remove: jest.fn()};
  });
});

afterEach(() => {
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
