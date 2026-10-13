import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import App from '../App';
import {supabase} from '../src/lib/auth/supabase';
import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
  rememberSignInOnThisInstall,
} from '../src/lib/app-guide-storage';
import {getCurrentProfile} from '../src/entities/info/api';
import {
  beginGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
} from '../src/entities/onboarding/transfer';
import {signInWithGoogle} from '../src/lib/auth/signInWithGoogle';
import {AppGuideScreen} from '../src/pages/guide/AppGuideScreen';
import {LoginScreen} from '../src/pages/login/LoginScreen';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {MapScreen} from '../src/pages/map/MapScreen';
import {InBoxScreen} from '../src/pages/inBox/inBoxScreen';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {MyPageScreen} from '../src/pages/my-page/MyPageScreen';
import {BottomNavigationBar} from '../src/components/BottomNavigationBar';
import {clearShareResult, getShareResults, resumeWaitingShares} from '../src/lib/share-intent';

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
    SafeAreaView: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));

jest.mock('../src/app/configureDataSources', () => ({
  configureDataSources: jest.fn(),
}));

jest.mock('../src/lib/auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('../src/lib/app-guide-storage', () => ({
  hasCompletedAppGuide: jest.fn(),
  completeAppGuide: jest.fn(),
  hasSignedInOnThisInstall: jest.fn(),
  rememberSignInOnThisInstall: jest.fn(),
}));

jest.mock('../src/lib/share-intent', () => ({
  reconcileShareSession: jest.fn(() => Promise.resolve()),
  syncShareSession: jest.fn(() => Promise.resolve()),
  getShareSession: jest.fn(() => Promise.resolve(null)),
  getShareResults: jest.fn(() => Promise.resolve([])),
  resumeWaitingShares: jest.fn(() => Promise.resolve()),
  syncShareAnalyticsConfiguration: jest.fn(() => Promise.resolve()),
  clearShareResult: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/entities/info/api', () => ({
  getCurrentProfile: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../src/entities/onboarding/transfer', () => ({
  beginGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  cancelGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  resumeGuestOnboardingTransfer: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../src/lib/auth/signInWithGoogle', () => ({
  signInWithGoogle: jest.fn(() => Promise.resolve({user: {id: 'new-user'}})),
}));

jest.mock('../src/pages/guide/AppGuideScreen', () => ({
  AppGuideScreen: () => null,
}));

jest.mock('../src/pages/login/LoginScreen', () => ({
  LoginScreen: () => null,
}));

jest.mock('../src/pages/saved-places/SavedPlacesScreen', () => ({
  SavedPlacesScreen: () => null,
}));

jest.mock('../src/pages/map/MapScreen', () => ({
  MapScreen: () => null,
}));

jest.mock('../src/pages/inBox/inBoxScreen', () => ({
  InBoxScreen: () => null,
}));

jest.mock('../src/pages/history/HistoryScreen', () => ({
  HistoryScreen: () => null,
}));

jest.mock('../src/pages/my-page/MyPageScreen', () => ({
  MyPageScreen: () => null,
}));

type AuthChangeHandler = (event: string, session: unknown) => void;
let authChangeHandler: AuthChangeHandler;

async function renderAfterSplash() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  jest.useFakeTimers();
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: {session: null},
    error: null,
  });
  (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation(
    (handler: AuthChangeHandler) => {
      authChangeHandler = handler;
      return {data: {subscription: {unsubscribe: jest.fn()}}};
    },
  );
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(false);
  (completeAppGuide as jest.Mock).mockResolvedValue(undefined);
  (hasSignedInOnThisInstall as jest.Mock).mockResolvedValue(false);
  (rememberSignInOnThisInstall as jest.Mock).mockResolvedValue(undefined);
  (getCurrentProfile as jest.Mock).mockClear();
  (beginGuestOnboardingTransfer as jest.Mock).mockResolvedValue(undefined);
  (resumeGuestOnboardingTransfer as jest.Mock).mockResolvedValue(false);
  (signInWithGoogle as jest.Mock).mockResolvedValue({user: {id: 'new-user'}});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('온보딩을 마친 비회원이 회원 API 요청 없이 메인에 진입한다', async () => {
  const renderer = await renderAfterSplash();
  expect(renderer.root.findAllByType(AppGuideScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(AppGuideScreen).props.onComplete();
  });

  const saved = renderer.root.findByType(SavedPlacesScreen);
  expect(saved.props.isGuest).toBe(true);
  expect(saved.props.places.map((place: {kakaoPlaceId: string}) => place.kakaoPlaceId)).toEqual([
    '1775568752',
    '137070444',
    '337953507',
    '98016856',
    '1107844606',
  ]);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(getCurrentProfile).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('구버전의 체험 결과가 남아도 예시 데이터가 있는 홈으로 이동한다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'guest-practice-request',
    url: 'https://www.instagram.com/p/Db4gRWqkuUg/',
    status: 'COMPLETED',
    transferStatus: 'GUEST_PREVIEW',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();

  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toHaveLength(5);
  expect(renderer.root.findAllByType(BottomNavigationBar)).toHaveLength(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(clearShareResult).toHaveBeenCalledWith('guest-practice-request');
  expect(getCurrentProfile).not.toHaveBeenCalled();
  expect(resumeWaitingShares).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('구버전의 로그인 유도 결과가 남아도 비회원 홈으로 이동한다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'guest-login-request',
    url: 'https://www.instagram.com/p/Db4gRWqkuUg/',
    status: 'PENDING',
    transferStatus: 'LOGIN_REQUIRED',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(clearShareResult).toHaveBeenCalledWith('guest-login-request');
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toHaveLength(5);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원이 다른 게시물을 공유하면 로그인 화면으로 이동하고 취소하면 예시 홈으로 돌아온다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'other-post-request',
    url: 'https://www.instagram.com/p/anotherPost/',
    status: 'PENDING',
    transferStatus: 'GUEST_LOGIN_PROMPT',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(clearShareResult).toHaveBeenCalledWith('other-post-request');
  expect(resumeWaitingShares).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onContinueBrowsing();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toHaveLength(5);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('온보딩을 완료한 비회원은 재실행 시 메인으로 진입하고 로그인 후 돌아올 수 있다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => {
    authChangeHandler('INITIAL_SESSION', null);
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onRequireLogin();
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onContinueBrowsing();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원 지도는 로그인 취소 후 다시 보이고 탭 재진입 시 새로 표시된다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('map');
  });
  expect(renderer.root.findByType(MapScreen).props).toMatchObject({
    isGuest: true,
  });
  expect(renderer.root.findByType(MapScreen).props.guestPlaces).toHaveLength(5);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onAuthenticationRequired();
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onContinueBrowsing();
  });
  expect(renderer.root.findByType(MapScreen).props.isGuest).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('saved');
  });
  expect(renderer.root.findAllByType(MapScreen)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('map');
  });
  expect(renderer.root.findByType(MapScreen).props).toMatchObject({
    isGuest: true,
    guestPlaces: expect.any(Array),
  });
  expect(renderer.root.findByType(MapScreen).props.guestPlaces).toHaveLength(5);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원도 대기함, 히스토리, 내 정보 화면을 열 수 있다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('inBox');
  });
  expect(renderer.root.findByType(InBoxScreen).props.guestItems).toEqual([]);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(InBoxScreen).props.onOpenHistory();
  });
  expect(renderer.root.findByType(HistoryScreen).props.guestReels).toEqual([]);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(HistoryScreen).props.onBack();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('my');
  });
  expect(renderer.root.findByType(MyPageScreen).props.isGuest).toBe(true);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(getCurrentProfile).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('로그아웃하면 회원 메인에서 로그인 화면으로 이동한다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: {session: {access_token: 'token', user: {id: 'user'}}},
    error: null,
  });
  const renderer = await renderAfterSplash();
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
  });
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('같은 설치에서 로그인한 기록이 있으면 세션이 없어도 로그인 화면으로 이동한다', async () => {
  (hasSignedInOnThisInstall as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(AppGuideScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원이 로그인하면 이번 설치의 로그인 기록을 저장한다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  expect(rememberSignInOnThisInstall).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', {access_token: 'token', user: {id: 'user'}});
  });
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원의 신규 계정 로그인에서 군자역 전환을 시작하고 회원 데이터로 다시 읽는다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (resumeGuestOnboardingTransfer as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onRequireLogin();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(LoginScreen).props.onContinueWithGoogle();
  });
  expect(beginGuestOnboardingTransfer).toHaveBeenCalledTimes(1);

  const session = {access_token: 'token', user: {id: 'new-user'}};
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', session);
    await Promise.resolve();
  });

  expect(resumeGuestOnboardingTransfer).toHaveBeenCalledWith(session);
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toBeUndefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('재설치로 앱 기록이 없으면 세션이 복원되어도 온보딩을 보여준다', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: {session: {access_token: 'token', user: {id: 'user'}}},
    error: null,
  });
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(AppGuideScreen)).toHaveLength(1);
  expect(rememberSignInOnThisInstall).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(AppGuideScreen).props.onComplete();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('새 설치에서 복원된 세션이 무효화되면 온보딩 후 비회원 메인으로 간다', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: {session: {access_token: 'token', user: {id: 'user'}}},
    error: null,
  });
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
    renderer.root.findByType(AppGuideScreen).props.onComplete();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
