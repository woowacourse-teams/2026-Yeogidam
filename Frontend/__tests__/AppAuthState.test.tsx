import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer from 'react-test-renderer';

import App from '../App';
import { logout, startSession } from '../src/lib/auth/tokenClient';
import type { NativeShareSession } from '../src/lib/share-intent';
import { LoginScreen } from '../src/pages/login/LoginScreen';
import { SavedPlacesScreen } from '../src/pages/saved-places/SavedPlacesScreen';

/** 앱과 공유 확장이 함께 쓰는 네이티브 세션 저장소를 메모리로 흉내 냅니다. */
const mockNativeStore: { session: NativeShareSession | null } = {
  session: null,
};

jest.mock('../src/lib/share-intent', () => ({
  ...jest.requireActual('../src/lib/share-intent'),
  getShareSession: () => Promise.resolve(mockNativeStore.session),
  setShareSession: (session: NativeShareSession | null) => {
    mockNativeStore.session = session;
    return Promise.resolve();
  },
}));
// Jest에는 네이티브 안전 영역 값이 없어 그대로 두면 화면을 그리지 않습니다.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
// 어느 화면이 떴는지만 봅니다.
jest.mock('../src/pages/login/LoginScreen', () => ({
  LoginScreen: () => null,
}));
jest.mock('../src/pages/saved-places/SavedPlacesScreen', () => ({
  SavedPlacesScreen: () => null,
}));

const SPLASH_MIN_DURATION_MS = 2000;

const loginTokens = {
  accessToken: 'login-access-token',
  refreshToken: 'login-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshTokenExpiresAt: '2099-02-01T00:00:00Z',
};

const originalFetch = globalThis.fetch;
let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

async function renderApp() {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  // 스플래시 최소 시간이 지나야 첫 화면이 뜹니다.
  await ReactTestRenderer.act(async () => {
    await jest.advanceTimersByTimeAsync(SPLASH_MIN_DURATION_MS);
  });
}

function isShowing(screen: React.ElementType) {
  return renderer!.root.findAllByType(screen).length > 0;
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockNativeStore.session = null;
  // 가이드를 마쳤고 1.1.1 첫 실행 정리도 끝난 기기입니다.
  await AsyncStorage.setItem('@yeogidam/app-guide-completed', 'true');
  await AsyncStorage.setItem('@yeogidam/first-run-cleanup-1.1.1', 'true');
  // 메인 화면의 프로필 조회와 서버 로그아웃은 네트워크 오류로 끝냅니다.
  globalThis.fetch = jest
    .fn()
    .mockRejectedValue(new TypeError('Network request failed'));
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
    jest.clearAllTimers();
  });
  renderer = undefined;
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

describe('app login state', () => {
  it('follows sign-in and sign-out announced by the token client', async () => {
    await renderApp();

    expect(isShowing(LoginScreen)).toBe(true);

    await ReactTestRenderer.act(() => startSession(loginTokens, 1));

    expect(isShowing(SavedPlacesScreen)).toBe(true);
    expect(isShowing(LoginScreen)).toBe(false);

    await ReactTestRenderer.act(() => logout());

    expect(isShowing(LoginScreen)).toBe(true);
    expect(isShowing(SavedPlacesScreen)).toBe(false);
  });

  it('opens the main screen when the app starts with a stored session', async () => {
    mockNativeStore.session = {
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: '1',
    };

    await renderApp();

    expect(isShowing(SavedPlacesScreen)).toBe(true);
    expect(isShowing(LoginScreen)).toBe(false);
  });
});
