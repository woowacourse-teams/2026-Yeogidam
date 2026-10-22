import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert, AppState} from 'react-native';

import App from '../App';
import {
  clearSpringSession,
  getSpringMemberId,
  getSpringTokens,
  onSpringSessionChange,
} from '../src/lib/auth/spring-session';
import {
  rememberSignInOnThisInstall,
} from '../src/lib/app-guide-storage';
import {getCurrentProfile} from '../src/entities/info/api';
import {signInWithGoogle} from '../src/lib/auth/signInWithGoogle';
import {OnboardingScreen} from '../src/pages/onboarding/OnboardingScreen';
import {LoginScreen} from '../src/pages/login/LoginScreen';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {MapScreen} from '../src/pages/map/MapScreen';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {AccountDeletionScreen} from '../src/pages/my-page/AccountDeletionScreen';
import {MyPageScreen} from '../src/pages/my-page/MyPageScreen';
import {deleteAccount, getLinkedDeletionProviders} from '../src/lib/auth/deleteAccount';
import {BottomNavigationBar} from '../src/components/BottomNavigationBar';
import {clearShareResult, getShareResults, resumeWaitingShares} from '../src/lib/share-intent';
import {setSharedSaveState} from '../src/lib/reel-save-state';
import {getAppUpdatePolicy} from '../src/lib/app-update-policy';
import {AppUpdateModal} from '../src/components/AppUpdateModal';
import {GuestLoginPrompt} from '../src/components/GuestLoginPrompt';
import {getDismissedRecommendedVersion} from '../src/lib/app-update-policy-storage';

const DISMISSED_RECOMMENDED_VERSION_KEY =
  '@yeogidam/dismissed-recommended-update-version';

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

jest.mock('../src/lib/auth/spring-session', () => ({
  getSpringTokens: jest.fn(),
  getSpringMemberId: jest.fn(),
  onSpringSessionChange: jest.fn(),
  logoutSpringSession: jest.fn(() => Promise.resolve()),
  clearSpringSession: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/lib/app-guide-storage', () => ({
  rememberSignInOnThisInstall: jest.fn(),
}));

jest.mock('../src/lib/share-intent', () => ({
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

jest.mock('../src/lib/auth/signInWithGoogle', () => ({
  signInWithGoogle: jest.fn(() => Promise.resolve({member: {id: 1}})),
}));

jest.mock('../src/lib/auth/deleteAccount', () => ({
  deleteAccount: jest.fn(() => Promise.resolve()),
  getLinkedDeletionProviders: jest.fn(() => []),
  isServerSideDeletionFailure: jest.requireActual('../src/lib/auth/deleteAccount')
    .isServerSideDeletionFailure,
}));

jest.mock('../src/pages/guide/AppGuideScreen', () => ({
  AppGuideScreen: () => null,
}));

jest.mock('../src/pages/onboarding/OnboardingScreen', () => ({
  OnboardingScreen: () => null,
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

jest.mock('../src/pages/history/HistoryScreen', () => ({
  HistoryScreen: () => null,
}));

jest.mock('../src/pages/my-page/MyPageScreen', () => ({
  MyPageScreen: () => null,
}));

jest.mock('../src/pages/my-page/AccountDeletionScreen', () => ({
  AccountDeletionScreen: () => null,
}));

type AuthChangeHandler = (
  event: string,
  memberId: string | null,
) => void;

const SPRING_TOKENS = {
  accessToken: 'token',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresAt: '2099-01-01T00:00:00Z',
  refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
};

function restoreSpringSession(memberId = 'user') {
  (getSpringTokens as jest.Mock).mockResolvedValue(SPRING_TOKENS);
  (getSpringMemberId as jest.Mock).mockResolvedValue(memberId);
}
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

async function completeOnboarding(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(OnboardingScreen).props.onComplete();
  });
}

// 로그아웃 상태로 열면 온보딩 → 로그인 화면을 거쳐 "로그인 없이 둘러보기"로 비회원 메인에 들어간다.
async function renderGuestMain() {
  const renderer = await renderAfterSplash();
  await completeOnboarding(renderer);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onBrowseAsGuest();
  });
  return renderer;
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.removeItem(DISMISSED_RECOMMENDED_VERSION_KEY);
  (getAppUpdatePolicy as jest.Mock).mockResolvedValue(null);
  (getSpringTokens as jest.Mock).mockResolvedValue(null);
  (getSpringMemberId as jest.Mock).mockResolvedValue(null);
  (onSpringSessionChange as jest.Mock).mockImplementation(
    (handler: AuthChangeHandler) => {
      authChangeHandler = handler;
      return jest.fn();
    },
  );
  (rememberSignInOnThisInstall as jest.Mock).mockResolvedValue(undefined);
  (getCurrentProfile as jest.Mock).mockReset().mockResolvedValue(null);
  (signInWithGoogle as jest.Mock).mockResolvedValue({member: {id: 1}});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('나중에 선택한 버전은 앱 재시작 후에도 숨기고 새 버전은 다시 안내한다', async () => {
  (getAppUpdatePolicy as jest.Mock).mockResolvedValue({
    updateRequired: false,
    updateRecommended: true,
    minimumSupportedVersion: '1.1.0',
    latestVersion: '1.2.0',
    storeUrl: 'https://example.com/store',
  });

  const renderer = await renderGuestMain();
  const recommendedModal = renderer.root.findAllByType(AppUpdateModal).find(
    modal => modal.props.mode === 'recommended',
  );
  expect(recommendedModal?.props.visible).toBe(true);
  expect(recommendedModal?.props.storeUrl).toBe('https://example.com/store');

  await ReactTestRenderer.act(async () => recommendedModal?.props.onDismiss());

  expect(recommendedModal?.props.visible).toBe(false);
  expect(await getDismissedRecommendedVersion()).toBe('1.2.0');
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());

  const afterRestart = await renderGuestMain();
  expect(
    afterRestart.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'recommended',
    )?.props.visible,
  ).toBe(false);
  await ReactTestRenderer.act(async () => afterRestart.unmount());

  (getAppUpdatePolicy as jest.Mock).mockResolvedValue({
    updateRequired: false,
    updateRecommended: true,
    minimumSupportedVersion: '1.1.0',
    latestVersion: '1.3.0',
    storeUrl: 'https://example.com/store',
  });
  const withNewVersion = await renderGuestMain();
  expect(
    withNewVersion.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'recommended',
    )?.props.visible,
  ).toBe(true);
  await ReactTestRenderer.act(async () => withNewVersion.unmount());
});

test('닫은 버전이어도 필수 업데이트는 표시한다', async () => {
  await AsyncStorage.setItem(DISMISSED_RECOMMENDED_VERSION_KEY, '1.2.0');
  (getAppUpdatePolicy as jest.Mock).mockResolvedValue({
    updateRequired: true,
    updateRecommended: false,
    minimumSupportedVersion: '1.3.0',
    latestVersion: '1.3.0',
    storeUrl: 'https://example.com/store',
  });

  const renderer = await renderAfterSplash();
  expect(
    renderer.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'required',
    )?.props.visible,
  ).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('로그아웃 상태로 열면 온보딩 뒤 로그인 화면을 보여준다', async () => {
  const renderer = await renderAfterSplash();
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findByType(LoginScreen).props.onBrowseAsGuest).toEqual(
    expect.any(Function),
  );
  expect(getCurrentProfile).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('온보딩 중에도 필수 업데이트를 표시한다', async () => {
  (getAppUpdatePolicy as jest.Mock).mockResolvedValue({
    updateRequired: true,
    updateRecommended: false,
    minimumSupportedVersion: '1.3.0',
    latestVersion: '1.3.0',
    storeUrl: 'https://example.com/store',
  });

  const renderer = await renderAfterSplash();
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  expect(
    renderer.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'required',
    )?.props.visible,
  ).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('온보딩 뒤 둘러보기를 고른 비회원은 목데이터 없는 보관함에 진입한다', async () => {
  const renderer = await renderGuestMain();

  const saved = renderer.root.findByType(SavedPlacesScreen);
  expect(saved.props.isGuest).toBe(true);
  expect(saved.props.places).toEqual([]);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(getCurrentProfile).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('구버전 체험 결과가 남아도 비회원 보관함에는 목데이터를 표시하지 않는다', async () => {
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'guest-practice-request',
    url: 'https://www.instagram.com/p/Db4gRWqkuUg/',
    status: 'COMPLETED',
    transferStatus: 'GUEST_PREVIEW',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();
  await completeOnboarding(renderer);

  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toEqual([]);
  expect(renderer.root.findAllByType(BottomNavigationBar)).toHaveLength(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(clearShareResult).toHaveBeenCalledWith('guest-practice-request');
  expect(getCurrentProfile).not.toHaveBeenCalled();
  expect(resumeWaitingShares).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('구버전의 로그인 유도 결과가 남아도 비회원 홈으로 이동한다', async () => {
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'guest-login-request',
    url: 'https://www.instagram.com/p/Db4gRWqkuUg/',
    status: 'PENDING',
    transferStatus: 'LOGIN_REQUIRED',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();
  await completeOnboarding(renderer);

  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(clearShareResult).toHaveBeenCalledWith('guest-login-request');
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toEqual([]);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원이 다른 게시물을 공유하면 로그인 화면으로 이동하고 취소하면 예시 홈으로 돌아온다', async () => {
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'other-post-request',
    url: 'https://www.instagram.com/p/anotherPost/',
    status: 'PENDING',
    transferStatus: 'GUEST_LOGIN_PROMPT',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();
  await completeOnboarding(renderer);

  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(clearShareResult).toHaveBeenCalledWith('other-post-request');
  expect(resumeWaitingShares).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onBrowseAsGuest();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toEqual([]);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('둘러보기 중 이전 공유가 열려 있어도 공유 화면에서 로그인을 누르고 넘어오면 로그인 화면을 유지하고 X로 둘러보기에 돌아온다', async () => {
  const renderer = await renderGuestMain();
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  // 앱이 포그라운드일 때만 1초 간격 폴링이 공유 결과를 읽는다.
  const previousAppState = AppState.currentState;
  (AppState as {currentState: string}).currentState = 'active';
  const pollOnce = async () => {
    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(1000);
      // getShareResults → getSpringTokens 비동기 체인이 끝나도록 비웁니다.
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });
  };
  const previousShare = {
    requestId: 'previous-request',
    url: 'https://www.instagram.com/p/previous/',
    status: 'COMPLETED',
    transferStatus: 'API_SUCCEEDED',
    reelId: 'previous-reel',
    retryable: false,
    updatedAt: Date.now() - 60_000,
  };
  // 네이티브 저장소처럼 지운 결과는 다시 읽히지 않게 한다.
  let storedResults: Record<string, unknown>[] = [previousShare];
  (getShareResults as jest.Mock).mockImplementation(() =>
    Promise.resolve([...storedResults]),
  );
  (clearShareResult as jest.Mock).mockImplementation((requestId?: string) => {
    storedResults = storedResults.filter(item => item.requestId !== requestId);
    return Promise.resolve();
  });

  try {
    // 이전 공유가 먼저 처리되어 화면에 열려 있다.
    await pollOnce();
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

    // 새 공유의 로그인 이동 결과가 도착한다.
    storedResults = [
      ...storedResults,
      {
        requestId: 'login-request',
        url: 'https://www.instagram.com/reel/loginRequired/',
        status: 'PENDING',
        transferStatus: 'LOGIN_HANDOFF',
        retryable: false,
        updatedAt: Date.now(),
      },
    ];
    await pollOnce();
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
    // 로그인해도 이 공유는 추출하지 않으므로 로그인 대기 상태로 남기지 않는다.
    expect(clearShareResult).toHaveBeenCalledWith('login-request');

    // 폴링이 계속 돌아도 이전 결과를 다시 처리해 둘러보기 화면으로 되돌아가지 않는다.
    for (let second = 0; second < 3; second += 1) {
      await pollOnce();
      expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
    }

    // 둘러보는 중에 넘어왔으므로 앱 안에서 연 로그인 화면처럼 "공유 취소" 없이 X로 돌아온다.
    const loginProps = renderer.root.findByType(LoginScreen).props;
    expect(loginProps.onCancelShareLogin).toBeUndefined();
    expect(loginProps.onBrowseAsGuest).toBeUndefined();
    expect(loginProps.onClose).toEqual(expect.any(Function));
    await ReactTestRenderer.act(async () => loginProps.onClose());
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
    expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);

    // 돌아온 뒤 폴링이 계속 돌아도 로그인 화면이 다시 열리지 않는다.
    await pollOnce();
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  } finally {
    (AppState as {currentState: string}).currentState = previousAppState;
    (getShareResults as jest.Mock).mockImplementation(() => Promise.resolve([]));
    (clearShareResult as jest.Mock).mockImplementation(() => Promise.resolve());
    setSharedSaveState(null);
    await ReactTestRenderer.act(async () => renderer.unmount());
  }
});

test('비회원 기능에서 연 로그인 화면은 X로 이전 화면에 돌아온다', async () => {
  const renderer = await renderGuestMain();

  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => {
    // 토큰 회전은 화면 흐름을 바꾸지 않습니다.
    authChangeHandler('TOKEN_REFRESHED', null);
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onRequireLogin();
  });
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  const loginProps = renderer.root.findByType(LoginScreen).props;
  expect(loginProps.onBrowseAsGuest).toBeUndefined();
  expect(loginProps.onClose).toEqual(expect.any(Function));
  await ReactTestRenderer.act(async () => loginProps.onClose());
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원 보관함의 추가 버튼은 로그인 안내 모달을 연다', async () => {
  const renderer = await renderGuestMain();
  const prompt = renderer.root.findByType(GuestLoginPrompt);

  expect(prompt.props.visible).toBe(false);
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onShowGuestLoginPrompt();
  });
  expect(prompt.props.visible).toBe(true);

  await ReactTestRenderer.act(async () => prompt.props.onContinueBrowsing());
  expect(prompt.props.visible).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원 지도에서 연 로그인 화면은 X로 지도로 돌아온다', async () => {
  const renderer = await renderGuestMain();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('map');
  });
  expect(renderer.root.findByType(MapScreen).props).toMatchObject({
    isGuest: true,
  });
  expect(renderer.root.findByType(MapScreen).props.guestPlaces).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onAuthenticationRequired();
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  const loginProps = renderer.root.findByType(LoginScreen).props;
  expect(loginProps.onBrowseAsGuest).toBeUndefined();
  await ReactTestRenderer.act(async () => loginProps.onClose());
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
  });
  expect(renderer.root.findByType(MapScreen).props.guestPlaces).toBeUndefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원 지도 인터랙션은 공통 로그인 안내 모달을 연다', async () => {
  const renderer = await renderGuestMain();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('map');
  });

  const map = renderer.root.findByType(MapScreen);
  const prompt = renderer.root.findByType(GuestLoginPrompt);
  expect(prompt.props.visible).toBe(false);
  expect(map.props.onShowGuestLoginPrompt).toEqual(expect.any(Function));

  await ReactTestRenderer.act(async () =>
    map.props.onShowGuestLoginPrompt(),
  );
  expect(prompt.props.visible).toBe(true);

  await ReactTestRenderer.act(async () => prompt.props.onContinueBrowsing());
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원도 히스토리와 내 정보 화면을 열 수 있다', async () => {
  const renderer = await renderGuestMain();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('history');
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(renderer.root.findByType(BottomNavigationBar).props.isGuest).toBe(true);
  const historyProps = renderer.root.findByType(HistoryScreen).props;
  expect(historyProps.guestReels).toEqual([]);
  expect(historyProps.guestDetails).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(HistoryScreen).props.onBack();
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('my');
  });
  expect(renderer.root.findByType(MyPageScreen).props.isGuest).toBe(true);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(getCurrentProfile).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MyPageScreen).props.onLogin();
  });
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findByType(LoginScreen).props).toMatchObject({
    onBrowseAsGuest: undefined,
    onClose: expect.any(Function),
  });

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onClose();
  });
  expect(renderer.root.findByType(MyPageScreen).props.isGuest).toBe(true);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('로그아웃하면 회원 메인에서 온보딩을 다시 보여준 뒤 로그인 화면으로 이동한다', async () => {
  restoreSpringSession();
  const renderer = await renderAfterSplash();
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
  });
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  // 로그인 화면의 "로그인 없이 둘러보기"로 비회원 메인에 들어간다.
  const onBrowseAsGuest = renderer.root.findByType(LoginScreen).props.onBrowseAsGuest;
  expect(onBrowseAsGuest).toEqual(expect.any(Function));
  await ReactTestRenderer.act(async () => onBrowseAsGuest());
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('v1 공유 추출이 완료되고 saveMode가 없어도 보관함을 연다', async () => {
  restoreSpringSession();
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'v1-share-request',
    url: 'https://www.instagram.com/reel/abc/',
    status: 'COMPLETED',
    transferStatus: 'API_SUCCEEDED',
    reelId: 'reel-1',
    retryable: false,
    updatedAt: Date.now(),
  }]);

  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(HistoryScreen)).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('같은 설치에서 로그인한 기록이 있어도 세션이 없으면 온보딩 뒤 로그인 화면으로 이동한다', async () => {
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('비회원이 로그인하면 이번 설치의 로그인 기록을 저장한다', async () => {
  const renderer = await renderGuestMain();

  expect(rememberSignInOnThisInstall).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'user');
  });
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('회원 탈퇴 후에도 로그인하면 비회원 예시 장소를 서버로 보내지 않는다', async () => {
  restoreSpringSession('deleted-user');
  (getCurrentProfile as jest.Mock).mockResolvedValue({
    id: 'deleted-user',
    oauthProvider: 'GOOGLE',
  });
  (getLinkedDeletionProviders as jest.Mock).mockReturnValue(['google']);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('my');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(MyPageScreen).props.onWithdraw();
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(AccountDeletionScreen).props.onDeleteAccount({
      confirmation: 'DELETE',
    });
  });
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(LoginScreen).props.onContinueWithGoogle();
  });
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('세션이 복원되면 온보딩 없이 회원 메인으로 들어가고 로그인 기록을 남긴다', async () => {
  restoreSpringSession();
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('복원된 세션이 무효화되면 온보딩 뒤 로그인 화면으로 이동한다', async () => {
  restoreSpringSession();
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
  });
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('공유가 로그인 만료(401)로 실패하면 추출 실패 대신 다시 공유하도록 안내한다', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  restoreSpringSession();
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'expired-share-request',
    url: '',
    status: 'FAILED',
    transferStatus: 'API_FAILED',
    failureReason: 'AUTH401_001 | 인증 토큰이 유효하지 않습니다. | HTTP_401',
    retryable: false,
    updatedAt: Date.now(),
  }]);
  const renderer = await renderAfterSplash();
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });

  expect(clearShareResult).toHaveBeenCalledWith('expired-share-request');
  expect(alertSpy).toHaveBeenCalledWith(
    '공유한 게시물을 저장하지 못했어요',
    '로그인 정보가 만료됐어요. 게시물을 다시 공유해 주세요.',
  );
  expect(alertSpy).not.toHaveBeenCalledWith('장소 추출 실패', expect.anything());
  alertSpy.mockRestore();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

async function openAccountDeletion() {
  restoreSpringSession('member-7');
  (getCurrentProfile as jest.Mock).mockResolvedValue({id: '7', oauthProvider: 'KAKAO'});
  (getLinkedDeletionProviders as jest.Mock).mockReturnValue(['kakao']);
  const renderer = await renderAfterSplash();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('my');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(MyPageScreen).props.onWithdraw();
  });
  return renderer;
}

test('회원탈퇴가 서버·네트워크 문제로 실패하면 탈퇴된 것처럼 처리한다', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (deleteAccount as jest.Mock).mockRejectedValueOnce({
    status: null,
    errorCode: 'CLIENT000_001',
    message: '인터넷 연결을 확인해주세요.',
    retryable: true,
  });
  const renderer = await openAccountDeletion();

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(AccountDeletionScreen).props.onDeleteAccount({
      confirmation: 'DELETE',
      providerTokens: {kakao: 'code'},
    });
  });

  expect(clearSpringSession).toHaveBeenCalled();
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(alertSpy).toHaveBeenCalledWith('회원탈퇴 완료', '회원탈퇴가 완료되었어요.');
  alertSpy.mockRestore();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('재인증 문제로 회원탈퇴가 실패하면 탈퇴 화면에 오류를 돌려준다', async () => {
  const reauthError = {
    status: 401,
    errorCode: 'USER401_001',
    message: '계정 보호를 위해 다시 로그인해주세요.',
    retryable: true,
  };
  (deleteAccount as jest.Mock).mockRejectedValueOnce(reauthError);
  const renderer = await openAccountDeletion();

  let thrown: unknown;
  await ReactTestRenderer.act(async () => {
    await renderer.root
      .findByType(AccountDeletionScreen)
      .props.onDeleteAccount({confirmation: 'DELETE', providerTokens: {kakao: 'code'}})
      .catch((error: unknown) => {
        thrown = error;
      });
  });

  expect(thrown).toBe(reauthError);
  expect(clearSpringSession).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(AccountDeletionScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
