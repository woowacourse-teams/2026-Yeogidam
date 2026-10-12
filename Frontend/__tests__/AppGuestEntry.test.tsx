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
import {AppGuideScreen} from '../src/pages/guide/AppGuideScreen';
import {LoginScreen} from '../src/pages/login/LoginScreen';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {MapScreen} from '../src/pages/map/MapScreen';
import {InBoxScreen} from '../src/pages/inBox/inBoxScreen';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {MyPageScreen} from '../src/pages/my-page/MyPageScreen';
import {BottomNavigationBar} from '../src/components/BottomNavigationBar';

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

test('비회원 지도는 탭을 떠나도 유지되고 로그인 취소 후 다시 보인다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('map');
  });
  expect(renderer.root.findByType(MapScreen).props).toMatchObject({
    isActive: true,
    isGuest: true,
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onAuthenticationRequired();
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onContinueBrowsing();
  });
  expect(renderer.root.findByType(MapScreen).props.isActive).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('saved');
  });
  expect(renderer.root.findByType(MapScreen).props.isActive).toBe(false);
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
