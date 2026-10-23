import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState} from 'react-native';

import {useNativeShareResults, type NativeShareResultHandlers} from '../src/app/useNativeShareResults';
import {getSpringTokens} from '../src/lib/auth/spring-session';
import {captureShareLoginHandoffError} from '../src/lib/monitoring/share-errors';
import {getSharedSaveState, setSharedSaveState} from '../src/lib/reel-save-state';
import {
  clearShareResult,
  getShareResults,
  resumeWaitingShares,
  type NativeShareResult,
} from '../src/lib/share-intent';
import {renderTracked, settleAsyncWork} from './support/renderers';

jest.mock('../src/lib/share-intent', () => ({
  getShareResults: jest.fn(() => Promise.resolve([])),
  clearShareResult: jest.fn(() => Promise.resolve()),
  resumeWaitingShares: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/lib/auth/spring-session', () => ({
  getSpringTokens: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../src/lib/monitoring/share-errors', () => ({
  captureShareLoginHandoffError: jest.fn(),
}));

const SPRING_TOKENS = {
  accessToken: 'token',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
};

const PREVIOUS_SHARE: NativeShareResult = {
  requestId: 'previous-request',
  url: 'https://www.instagram.com/p/previous/',
  status: 'COMPLETED',
  transferStatus: 'API_SUCCEEDED',
  reelId: 'previous-reel',
  retryable: false,
  updatedAt: 1_000,
};

const LOGIN_HANDOFF: NativeShareResult = {
  requestId: 'login-request',
  url: 'https://www.instagram.com/reel/loginRequired/',
  status: 'PENDING',
  transferStatus: 'LOGIN_HANDOFF',
  retryable: false,
  updatedAt: 2_000,
};

const handlers: NativeShareResultHandlers = {
  onGuestLoginPrompt: jest.fn(),
  onOpenSavedPlaces: jest.fn(),
  onLoginHandoff: jest.fn(),
  onLoginRequired: jest.fn(),
  onShareFailed: jest.fn(),
};
let latest: ReturnType<typeof useNativeShareResults>;

function Harness() {
  latest = useNativeShareResults(true, handlers);
  return null;
}

// 네이티브 저장소처럼 지운 결과는 다시 읽히지 않게 한다.
let storedResults: NativeShareResult[] = [];

/** 폴링 한 번(1초)을 돌리고 getShareResults → getSpringTokens 비동기 사슬이 끝날 때까지 기다립니다. */
async function pollOnce() {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await settleAsyncWork();
}

// 폴링은 앱이 활성 상태일 때만 돌므로 currentState를 바꿔 둡니다. 값이 jest.fn()이라 defineProperty로 되돌립니다.
const presetCurrentState = AppState.currentState;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {value: 'active', configurable: true});
  storedResults = [];
  jest.mocked(getShareResults).mockImplementation(() => Promise.resolve([...storedResults]));
  jest.mocked(clearShareResult).mockImplementation((requestId?: string) => {
    storedResults = storedResults.filter(item => item.requestId !== requestId);
    return Promise.resolve();
  });
  jest.mocked(getSpringTokens).mockResolvedValue(null);
  setSharedSaveState(null);
});

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', {value: presetCurrentState, configurable: true});
  setSharedSaveState(null);
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('공유 화면에서 로그인을 누르고 넘어온 결과는 열려 있던 공유보다 먼저 처리하고, 결과를 지운 뒤 로그인 화면으로 보낸다', async () => {
  storedResults = [PREVIOUS_SHARE];
  await renderTracked(<Harness />);
  await settleAsyncWork();
  // 이전 공유가 먼저 처리되어 보관함에 진행 상태로 열려 있다.
  expect(handlers.onOpenSavedPlaces).toHaveBeenCalledWith('share-progress');
  expect(getSharedSaveState()?.shareResultId).toBe('previous-request');

  storedResults = [PREVIOUS_SHARE, LOGIN_HANDOFF];
  await pollOnce();
  expect(handlers.onLoginHandoff).toHaveBeenCalledTimes(1);
  expect(clearShareResult).toHaveBeenCalledWith('login-request');
  // 로그인해도 이 공유는 추출하지 않으므로 로그인 대기 상태로 남기지 않는다.
  expect(latest.hasPendingShareLogin).toBe(false);

  // 폴링이 계속 돌아도 이전 결과를 다시 처리해 화면을 되돌리지 않는다.
  await pollOnce();
  await pollOnce();
  expect(handlers.onOpenSavedPlaces).toHaveBeenCalledTimes(1);
  expect(handlers.onLoginHandoff).toHaveBeenCalledTimes(1);
  expect(handlers.onLoginRequired).not.toHaveBeenCalled();
});

test('로그인 이동 결과가 있어도 세션이 있으면 공유를 재개하고 결과를 지우지 않는다', async () => {
  jest.mocked(getSpringTokens).mockResolvedValue(SPRING_TOKENS);
  storedResults = [LOGIN_HANDOFF];
  await renderTracked(<Harness />);
  await settleAsyncWork();

  expect(resumeWaitingShares).toHaveBeenCalled();
  expect(handlers.onLoginHandoff).not.toHaveBeenCalled();
  expect(clearShareResult).not.toHaveBeenCalled();
  expect(latest.hasPendingShareLogin).toBe(true);
});

test('세션을 읽지 못하면 오류를 기록하고 세션이 없을 때와 같게 결과를 지우고 로그인 화면으로 보낸다', async () => {
  jest.mocked(getSpringTokens).mockRejectedValue(new Error('keychain unavailable'));
  storedResults = [LOGIN_HANDOFF];
  await renderTracked(<Harness />);
  await settleAsyncWork();

  expect(captureShareLoginHandoffError).toHaveBeenCalledWith('SHARE_LOGIN_STATE_READ_FAILED');
  expect(handlers.onLoginHandoff).toHaveBeenCalledTimes(1);
  expect(clearShareResult).toHaveBeenCalledWith('login-request');
  expect(latest.hasPendingShareLogin).toBe(false);
});

test('비회원 로그인 유도 결과는 결과와 공유 상태를 지우고 로그인 화면으로 보내며, 결과가 모두 사라지면 처리한 키를 비운다', async () => {
  const guestPrompt: NativeShareResult = {
    requestId: 'guest-request',
    url: 'https://www.instagram.com/p/anotherPost/',
    status: 'PENDING',
    transferStatus: 'GUEST_LOGIN_PROMPT',
    retryable: false,
    updatedAt: 3_000,
  };
  storedResults = [PREVIOUS_SHARE, guestPrompt];
  await renderTracked(<Harness />);
  await settleAsyncWork();

  expect(handlers.onGuestLoginPrompt).toHaveBeenCalledTimes(1);
  expect(handlers.onOpenSavedPlaces).not.toHaveBeenCalled();
  expect(clearShareResult).toHaveBeenCalledWith('guest-request');
  expect(getSharedSaveState()).toBeNull();

  // 저장소가 비면 처리한 키도 비워, 같은 키의 결과가 다시 남으면 새로 처리한다.
  storedResults = [];
  await pollOnce();
  storedResults = [guestPrompt];
  await pollOnce();
  expect(handlers.onGuestLoginPrompt).toHaveBeenCalledTimes(2);
});
