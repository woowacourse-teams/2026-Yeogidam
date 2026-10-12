import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { PostHogRoot } from '../src/app/PostHogRoot';
import { logout, startSession } from '../src/lib/auth/tokenClient';
import type { NativeShareSession } from '../src/lib/share-intent';

/** 앱과 공유 확장이 함께 쓰는 네이티브 세션 저장소를 메모리로 흉내 냅니다. */
const mockNativeStore: { session: NativeShareSession | null } = {
  session: null,
};
const mockPostHog = { identify: jest.fn(), reset: jest.fn() };

jest.mock('../src/lib/share-intent', () => ({
  ...jest.requireActual('../src/lib/share-intent'),
  getShareSession: () => Promise.resolve(mockNativeStore.session),
  setShareSession: (session: NativeShareSession | null) => {
    mockNativeStore.session = session;
    return Promise.resolve();
  },
}));
// PostHog 키가 있어야 PostHogRoot가 식별 컴포넌트를 그립니다.
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    POSTHOG_PROJECT_TOKEN: 'test-project-token',
    POSTHOG_HOST: 'https://posthog.example.com',
  },
}));
jest.mock('posthog-react-native', () => ({
  PostHogProvider: ({ children }: { children: unknown }) => children,
  usePostHog: () => mockPostHog,
}));

const loginTokens = {
  accessToken: 'login-access-token',
  refreshToken: 'login-refresh-token',
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshTokenExpiresAt: '2099-02-01T00:00:00Z',
};

let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

async function renderRoot() {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<PostHogRoot>{null}</PostHogRoot>);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeStore.session = null;
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
});

describe('PostHog identity', () => {
  it('identifies the stored member when the app starts signed in', async () => {
    mockNativeStore.session = {
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: '42',
    };

    await renderRoot();

    expect(mockPostHog.identify).toHaveBeenCalledWith('42');
  });

  it('identifies the member after sign-in and resets PostHog after logout', async () => {
    await renderRoot();

    expect(mockPostHog.identify).not.toHaveBeenCalled();

    await ReactTestRenderer.act(() => startSession(loginTokens, 42));

    expect(mockPostHog.identify).toHaveBeenCalledWith('42');
    expect(mockPostHog.reset).not.toHaveBeenCalled();

    await ReactTestRenderer.act(() => logout());

    expect(mockPostHog.reset).toHaveBeenCalledTimes(1);
  });
});
