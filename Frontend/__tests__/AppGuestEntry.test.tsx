import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert, AppState} from 'react-native';

import App from '../App';
import {SwipeBackStack} from '../src/components/navigation/SwipeBackStack';
import {
  clearSpringSession,
  getSpringMemberId,
  getSpringTokens,
  LocalSessionCleanupError,
  logoutSpringSession,
  onSpringSessionChange,
} from '../src/lib/auth/spring-session';
import {rememberSignInOnThisInstall} from '../src/lib/app-guide-storage';
import {getCurrentProfile} from '../src/entities/info/api';
import {signInWithGoogle} from '../src/lib/auth/signInWithGoogle';
import {OnboardingScreen} from '../src/pages/onboarding/OnboardingScreen';
import {LoginScreen} from '../src/pages/login/LoginScreen';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {MapScreen} from '../src/pages/map/MapScreen';
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {AccountDeletionScreen} from '../src/pages/my-page/AccountDeletionScreen';
import {MyPageScreen} from '../src/pages/my-page/MyPageScreen';
import {TermsAgreementScreen} from '../src/pages/my-page/TermsAgreementScreen';
import {PlaceDetailScreen} from '../src/pages/place-detail/PlaceDetailScreen';
import {deleteAccount, getLinkedDeletionProviders} from '../src/lib/auth/deleteAccount';
import {BottomNavigationBar} from '../src/components/BottomNavigationBar';
import {clearShareResult, getShareResults, resumeWaitingShares} from '../src/lib/share-intent';
import {setSharedSaveState} from '../src/lib/reel-save-state';
import {getAppUpdatePolicy} from '../src/lib/app-update-policy';
import {AppUpdateModal} from '../src/components/AppUpdateModal';
import {GuestLoginPrompt} from '../src/components/GuestLoginPrompt';
import {getDismissedRecommendedVersion} from '../src/lib/app-update-policy-storage';
import {clearSavedPlacesCache} from '../src/entities/info/saved-places-cache';
import {mockAndroidBackHandler} from './support/androidBackHandler';
import {renderTracked, settleAsyncWork, unmountTracked} from './support/renderers';
import {CACHED_CAFE} from './support/savedPlacesFixtures';

const DISMISSED_RECOMMENDED_VERSION_KEY =
  '@yeogidam/dismissed-recommended-update-version';

/** 뒤로 가기 스택에서 지금 보이는 층의 하단 메뉴입니다. 머문 탭이 모두 그려져 있어 보이는 층으로 좁혀 찾습니다. */
function activeBar(renderer: ReactTestRenderer.ReactTestRenderer) {
  const stack = renderer.root.findByType(SwipeBackStack);
  return renderer.root.findByProps({testID: `back-screen-${stack.props.activeKey}`}).findByType(BottomNavigationBar);
}

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
  logoutSpringSession: jest.fn(() => Promise.resolve({serverConfirmed: true})),
  clearSpringSession: jest.fn(() => Promise.resolve()),
  LocalSessionCleanupError: class extends Error {},
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

jest.mock('../src/lib/monitoring/login-errors', () => ({
  captureSocialLoginError: jest.fn(),
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

jest.mock('../src/entities/info/saved-places-cache', () => ({
  clearSavedPlacesCache: jest.fn(),
}));

jest.mock('../src/pages/map/MapScreen', () => ({
  MapScreen: ({bottomNavigationBar}: {bottomNavigationBar?: React.ReactNode}) => bottomNavigationBar ?? null,
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

jest.mock('../src/pages/my-page/TermsAgreementScreen', () => ({
  TermsAgreementScreen: () => null,
}));

jest.mock('../src/pages/place-detail/PlaceDetailScreen', () => ({
  PlaceDetailScreen: () => null,
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
let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

/** App을 그리고 스플래시 최소 시간을 넘깁니다. 그린 App은 테스트가 끝나면 setupFilesAfterEnv가 내립니다. */
async function renderAfterSplash() {
  const renderer = await renderTracked(<App />);
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

/**
 * 공용 Android 뒤로 가기 도우미를 App에 맞게 감쌉니다. App을 그리기 전에 불러야 하고, 누르기는 App의 상태 갱신이
 * 반영되도록 act 안에서 합니다. 이 파일의 afterEach는 clearAllMocks만 하므로 테스트 끝에 restore를 직접 부릅니다.
 */
function installAndroidBackPress() {
  const {pressBack: press, restore} = mockAndroidBackHandler();

  /** 시스템 뒤로 가기를 누르고 App이 가로챘는지(true) 돌려줍니다. */
  const pressBack = async () => {
    let handled = false;
    await ReactTestRenderer.act(async () => {
      handled = press();
    });
    return handled;
  };

  return {pressBack, restore};
}

/** SwipeBackStack이 맨 앞에 둔 층의 키입니다. */
function activeLayerKey(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(SwipeBackStack).props.activeKey;
}

/** 앱이 포그라운드일 때 1초마다 도는 공유 결과 폴링을 한 번 돌리고, getShareResults 뒤의 비동기 사슬이 끝날 때까지 기다립니다. */
async function pollShareResultsOnce() {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1000);
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
}

function acceptedShareResult(requestId: string, updatedAt: number) {
  return {
    requestId,
    url: `https://www.instagram.com/reel/${requestId}/`,
    status: 'COMPLETED',
    transferStatus: 'API_SUCCEEDED',
    reelId: `reel-${requestId}`,
    retryable: false,
    updatedAt,
  };
}

beforeEach(async () => {
  jest.useFakeTimers();
  // 알림이 실제로 뜨지 않게 모든 테스트에서 가로채고, 안내를 확인하는 테스트는 이 alertSpy로 단언합니다. 되돌리기는 afterEach가 맡습니다.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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

// 단언이 중간에 실패해도 가로챈 Alert와 가짜 타이머가 다음 테스트로 넘어가지 않게 되돌립니다. 그린 App은 setupFilesAfterEnv가 먼저 내립니다.
afterEach(() => {
  alertSpy.mockRestore();
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
  await unmountTracked(renderer);

  const afterRestart = await renderGuestMain();
  expect(
    afterRestart.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'recommended',
    )?.props.visible,
  ).toBe(false);
  await unmountTracked(afterRestart);

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
});

test('로그아웃 상태로 열면 온보딩 뒤 로그인 화면을 보여준다', async () => {
  const renderer = await renderAfterSplash();
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  // 온보딩 뒤의 로그인 화면은 돌아갈 화면이 없어 X 없이 "로그인 없이 둘러보기"만 둔다.
  const loginProps = renderer.root.findByType(LoginScreen).props;
  expect(loginProps.onBrowseAsGuest).toEqual(expect.any(Function));
  expect(loginProps.onClose).toBeUndefined();
  expect(getCurrentProfile).not.toHaveBeenCalled();
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
});

test('온보딩 뒤 둘러보기를 고른 비회원은 목데이터 없는 보관함에 진입한다', async () => {
  const renderer = await renderGuestMain();

  const saved = renderer.root.findByType(SavedPlacesScreen);
  expect(saved.props.isGuest).toBe(true);
  expect(saved.props.places).toEqual([]);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(getCurrentProfile).not.toHaveBeenCalled();
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
});

test('둘러보기 중 이전 공유가 열려 있어도 공유 화면에서 로그인을 누르고 넘어오면 로그인 화면을 유지하고 X로 둘러보기에 돌아온다', async () => {
  const renderer = await renderGuestMain();
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);

  // 앱이 포그라운드일 때만 1초 간격 폴링이 공유 결과를 읽는다.
  const previousAppState = AppState.currentState;
  (AppState as {currentState: string}).currentState = 'active';
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
    await pollShareResultsOnce();
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
    await pollShareResultsOnce();
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
    // 로그인해도 이 공유는 추출하지 않으므로 로그인 대기 상태로 남기지 않는다.
    expect(clearShareResult).toHaveBeenCalledWith('login-request');

    // 폴링이 계속 돌아도 이전 결과를 다시 처리해 둘러보기 화면으로 되돌아가지 않는다.
    for (let second = 0; second < 3; second += 1) {
      await pollShareResultsOnce();
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
    await pollShareResultsOnce();
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  } finally {
    (AppState as {currentState: string}).currentState = previousAppState;
    (getShareResults as jest.Mock).mockImplementation(() => Promise.resolve([]));
    (clearShareResult as jest.Mock).mockImplementation(() => Promise.resolve());
    setSharedSaveState(null);
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
});

test('비회원 지도는 로그인 취소 후 다시 보이고 탭 이동 중에는 상태를 유지한다', async () => {
  const renderer = await renderGuestMain();

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
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
    activeBar(renderer).props.onNavigate('saved');
  });
  expect(renderer.root.findByType(MapScreen).props.isActive).toBe(false);

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
  });
  expect(renderer.root.findByType(MapScreen).props).toMatchObject({
    isGuest: true,
  });
  expect(renderer.root.findByType(MapScreen).props.guestPlaces).toBeUndefined();
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
  expect(prompt.props.visible).toBe(false);
});

test('비회원 로그인 안내 콜백은 App이 다시 그려져도 같은 참조라 화면의 제스처 응답자를 다시 만들지 않는다', async () => {
  const renderer = await renderGuestMain();
  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
  });
  const {onShowGuestLoginPrompt} = renderer.root.findByType(MapScreen).props;
  const savedCallback = renderer.root.findByType(SavedPlacesScreen).props.onShowGuestLoginPrompt;

  // 지도가 안쪽 뒤로 가기 상태를 알려 App이 다시 그려진다.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onNestedBackStateChange(true);
  });
  expect(renderer.root.findByType(MapScreen).props.onShowGuestLoginPrompt).toBe(onShowGuestLoginPrompt);
  expect(renderer.root.findByType(SavedPlacesScreen).props.onShowGuestLoginPrompt).toBe(savedCallback);

  // 참조가 같아도 안내는 그대로 연다.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onNestedBackStateChange(false);
  });
  await ReactTestRenderer.act(async () => onShowGuestLoginPrompt());
  expect(renderer.root.findByType(GuestLoginPrompt).props.visible).toBe(true);
});

test('비회원도 히스토리와 내 정보 화면을 열 수 있다', async () => {
  const renderer = await renderGuestMain();

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('history');
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(activeBar(renderer).props.isGuest).toBe(true);
  const historyProps = renderer.root.findByType(HistoryScreen).props;
  expect(historyProps.guestReels).toEqual([]);
  expect(historyProps.guestDetails).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(HistoryScreen).props.onBack();
  });
  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('my');
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
});

test('히스토리에서 뒤로 가면 하단 메뉴로 오기 전 탭으로 돌아가고, 머문 탭은 내려가지 않는다', async () => {
  const renderer = await renderGuestMain();

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
  });
  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('history');
  });
  expect(renderer.root.findByType(SwipeBackStack).props).toMatchObject({
    activeKey: 'history',
    backKey: 'map',
  });
  expect(renderer.root.findByType(HistoryScreen).props.isActive).toBe(true);
  expect(renderer.root.findByType(MapScreen).props.isActive).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(HistoryScreen).props.onBack();
  });
  expect(renderer.root.findByType(SwipeBackStack).props).toMatchObject({
    activeKey: 'map',
    backKey: 'saved',
  });
  expect(renderer.root.findByType(HistoryScreen).props.isActive).toBe(false);
  expect(renderer.root.findByType(MapScreen).props.isActive).toBe(true);
});

test('Android 시스템 뒤로 가기는 겹침 화면, 탭 이력 순으로 되돌리고 첫 탭에서는 시스템에 맡긴다', async () => {
  const {pressBack, restore} = installAndroidBackPress();

  try {
    const renderer = await renderGuestMain();

    await ReactTestRenderer.act(async () => {
      activeBar(renderer).props.onNavigate('my');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(MyPageScreen).props.onOpenTerms();
    });
    expect(renderer.root.findAllByType(TermsAgreementScreen)).toHaveLength(1);

    expect(await pressBack()).toBe(true);
    expect(renderer.root.findAllByType(TermsAgreementScreen)).toHaveLength(0);
    expect(activeLayerKey(renderer)).toBe('my');

    expect(await pressBack()).toBe(true);
    expect(activeLayerKey(renderer)).toBe('saved');

    expect(await pressBack()).toBe(false);
    expect(activeLayerKey(renderer)).toBe('saved');
  } finally {
    restore();
  }
});

test('Android 시스템 뒤로 가기는 열린 상세를 닫고 가로챈다', async () => {
  const {pressBack, restore} = installAndroidBackPress();

  try {
    const renderer = await renderGuestMain();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(SavedPlacesScreen).props.onOpenDetail(CACHED_CAFE);
    });
    expect(renderer.root.findAllByType(PlaceDetailScreen)).toHaveLength(1);
    expect(activeLayerKey(renderer)).toBe('detail');

    expect(await pressBack()).toBe(true);
    expect(renderer.root.findAllByType(PlaceDetailScreen)).toHaveLength(0);
    expect(activeLayerKey(renderer)).toBe('saved');
    // 상세를 닫은 뒤 보관함은 첫 탭이라 다음 뒤로 가기는 시스템에 맡긴다.
    expect(await pressBack()).toBe(false);
  } finally {
    restore();
  }
});

test('Android 시스템 뒤로 가기는 로그인 위에 쌓인 약관을 걷어 로그인 화면으로 돌아간다', async () => {
  const {pressBack, restore} = installAndroidBackPress();

  try {
    const renderer = await renderAfterSplash();
    await completeOnboarding(renderer);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(LoginScreen).props.onOpenTerms();
    });
    expect(renderer.root.findAllByType(TermsAgreementScreen)).toHaveLength(1);
    expect(activeLayerKey(renderer)).toBe('auth-1-terms');

    expect(await pressBack()).toBe(true);
    expect(renderer.root.findAllByType(TermsAgreementScreen)).toHaveLength(0);
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
    expect(activeLayerKey(renderer)).toBe('auth-0-login');
    // 로그인 화면 하나만 남으면 시스템에 맡긴다.
    expect(await pressBack()).toBe(false);
    expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  } finally {
    restore();
  }
});

test('Android 시스템 뒤로 가기는 탭 화면이 스스로 뒤로 갈 수 있다고 알리면 그 화면에 맡기고, 아니면 탭 이력으로 돌아간다', async () => {
  const {pressBack, restore} = installAndroidBackPress();

  try {
    const renderer = await renderGuestMain();
    await ReactTestRenderer.act(async () => {
      activeBar(renderer).props.onNavigate('map');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(MapScreen).props.onNestedBackStateChange(true);
    });

    // 지도가 시트나 상세를 열어 둔 동안은 지도가 처리하므로 App은 가로채지 않고 탭도 옮기지 않는다.
    expect(await pressBack()).toBe(false);
    expect(activeLayerKey(renderer)).toBe('map');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByType(MapScreen).props.onNestedBackStateChange(false);
    });
    expect(await pressBack()).toBe(true);
    expect(activeLayerKey(renderer)).toBe('saved');
  } finally {
    restore();
  }
});

test('지도를 보던 회원에게 공유 결과가 보관함을 열면 뒤로 가기가 제자리걸음 없이 이력대로 가고, 이력이 없으면 바로 시스템에 맡긴다', async () => {
  const {pressBack, restore} = installAndroidBackPress();
  restoreSpringSession();
  const previousAppState = AppState.currentState;
  (AppState as {currentState: string}).currentState = 'active';
  let storedResults: Record<string, unknown>[] = [];
  (getShareResults as jest.Mock).mockImplementation(() => Promise.resolve([...storedResults]));

  try {
    const renderer = await renderAfterSplash();
    const stack = () => renderer.root.findByType(SwipeBackStack).props;

    // 보관함에서 하단 메뉴로 지도에 간 뒤 공유 결과가 보관함을 연다. 이력 끝의 보관함은 빠져 뒤로 갈 곳이 없다.
    await ReactTestRenderer.act(async () => {
      activeBar(renderer).props.onNavigate('map');
    });
    storedResults = [acceptedShareResult('share-1', Date.now())];
    await pollShareResultsOnce();
    expect(stack()).toMatchObject({activeKey: 'saved', backKey: null});
    expect(await pressBack()).toBe(false);
    expect(activeLayerKey(renderer)).toBe('saved');

    // 지도와 내 정보를 거친 뒤 공유 결과가 보관함을 열면 뒤로 가기 한 번에 지도로 돌아간다.
    await ReactTestRenderer.act(async () => {
      activeBar(renderer).props.onNavigate('map');
    });
    await ReactTestRenderer.act(async () => {
      activeBar(renderer).props.onNavigate('my');
    });
    storedResults = [acceptedShareResult('share-2', Date.now() + 1)];
    await pollShareResultsOnce();
    expect(stack()).toMatchObject({activeKey: 'saved', backKey: 'map'});
    expect(await pressBack()).toBe(true);
    expect(activeLayerKey(renderer)).toBe('map');
    expect(await pressBack()).toBe(true);
    expect(activeLayerKey(renderer)).toBe('saved');
    expect(await pressBack()).toBe(false);
  } finally {
    (AppState as {currentState: string}).currentState = previousAppState;
    (getShareResults as jest.Mock).mockImplementation(() => Promise.resolve([]));
    setSharedSaveState(null);
    restore();
  }
});

test('지도 탭에서만 지도가 알린 뒤로 가기 스와이프 영역을 SwipeBackStack에 넘긴다', async () => {
  const renderer = await renderGuestMain();
  const stack = () => renderer.root.findByType(SwipeBackStack).props;
  expect(stack().gestureRegion).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
  });
  // 지도가 영역을 알리기 전에는 어디서도 스와이프를 받지 않는 영역이다.
  expect(stack().gestureRegion).toEqual({top: Number.MAX_SAFE_INTEGER, bottom: 0});

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onBackGestureRegionChange({top: 120, bottom: 80});
  });
  expect(stack().gestureRegion).toEqual({top: 120, bottom: 80});

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('saved');
  });
  expect(stack().gestureRegion).toBeUndefined();
});

test('탭 화면이 스스로 뒤로 갈 수 있으면 스와이프를 끄고, 상세와 겹침 화면에서는 켜며, 스와이프 뒤로 가기가 상세와 겹침 화면을 닫는다', async () => {
  const renderer = await renderGuestMain();
  const stack = () => renderer.root.findByType(SwipeBackStack).props;
  expect(stack().enabled).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onNestedBackStateChange(true);
  });
  expect(stack().enabled).toBe(false);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onOpenDetail(CACHED_CAFE);
  });
  expect(stack()).toMatchObject({activeKey: 'detail', backKey: 'saved', enabled: true});

  await ReactTestRenderer.act(async () => stack().onBack());
  expect(renderer.root.findAllByType(PlaceDetailScreen)).toHaveLength(0);
  expect(stack()).toMatchObject({activeKey: 'saved', enabled: false});

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onOpenGuide();
  });
  expect(stack()).toMatchObject({activeKey: 'myPage-guide', backKey: 'saved', enabled: true});

  await ReactTestRenderer.act(async () => stack().onBack());
  expect(stack()).toMatchObject({activeKey: 'saved', enabled: false});

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onNestedBackStateChange(false);
  });
  expect(stack().enabled).toBe(true);
});

test('SwipeBackStack은 탭을 옮겨도 그대로 두고, 흐름 종류나 세션이 바뀌면 새로 만든다', async () => {
  const renderer = await renderGuestMain();
  const mainStack = renderer.root.findByType(SwipeBackStack);

  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('map');
  });
  expect(renderer.root.findByType(SwipeBackStack)).toBe(mainStack);

  // 비회원 메인에서 로그인 화면으로 가면 인증 흐름의 스택을 새로 만든다.
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(MapScreen).props.onAuthenticationRequired();
  });
  const authStack = renderer.root.findByType(SwipeBackStack);
  expect(authStack).not.toBe(mainStack);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(LoginScreen).props.onClose();
  });
  const returnedStack = renderer.root.findByType(SwipeBackStack);
  expect(returnedStack).not.toBe(authStack);

  // 로그인하면 회원 세션의 스택을 새로 만든다.
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'user');
  });
  expect(renderer.root.findByType(SwipeBackStack)).not.toBe(returnedStack);
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

  // 로그아웃 뒤의 로그인 화면은 돌아갈 화면이 없어 X 없이 "로그인 없이 둘러보기"로 비회원 메인에 들어간다.
  const loginProps = renderer.root.findByType(LoginScreen).props;
  expect(loginProps.onClose).toBeUndefined();
  expect(loginProps.onBrowseAsGuest).toEqual(expect.any(Function));
  await ReactTestRenderer.act(async () => loginProps.onBrowseAsGuest());
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
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
});

test('같은 설치에서 로그인한 기록이 있어도 세션이 없으면 온보딩 뒤 로그인 화면으로 이동한다', async () => {
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
});

test('비회원이 로그인하면 이번 설치의 로그인 기록을 저장한다', async () => {
  await renderGuestMain();

  expect(rememberSignInOnThisInstall).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'user');
  });
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
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
    activeBar(renderer).props.onNavigate('my');
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
  expect(signInWithGoogle).toHaveBeenCalledTimes(1);
});

test('세션이 복원되면 온보딩 없이 회원 메인으로 들어가고 로그인 기록을 남긴다', async () => {
  restoreSpringSession();
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(rememberSignInOnThisInstall).toHaveBeenCalledTimes(1);
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
});

test('공유가 로그인 만료(401)로 실패하면 추출 실패 대신 다시 공유하도록 안내한다', async () => {
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
  await renderAfterSplash();
  await settleAsyncWork();

  expect(clearShareResult).toHaveBeenCalledWith('expired-share-request');
  expect(alertSpy).toHaveBeenCalledWith(
    '공유한 게시물을 저장하지 못했어요',
    '로그인 정보가 만료됐어요. 게시물을 다시 공유해 주세요.',
  );
  expect(alertSpy).not.toHaveBeenCalledWith('장소 추출 실패', expect.anything());
});

async function openAccountDeletion() {
  restoreSpringSession('member-7');
  (getCurrentProfile as jest.Mock).mockResolvedValue({id: '7', oauthProvider: 'KAKAO'});
  (getLinkedDeletionProviders as jest.Mock).mockReturnValue(['kakao']);
  const renderer = await renderAfterSplash();
  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('my');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(MyPageScreen).props.onWithdraw();
  });
  return renderer;
}

test('회원탈퇴가 서버·네트워크 문제로 실패하면 탈퇴된 것처럼 처리한다', async () => {
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
});

test('로그인하면 비회원이 보던 보관함 스크롤 위치를 처음으로 되돌린다', async () => {
  const renderer = await renderGuestMain();
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(SavedPlacesScreen).props.onScrollOffsetChange(300);
  });
  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'user');
  });

  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(renderer.root.findByType(SavedPlacesScreen).props.initialScrollOffset).toBe(0);
});

test('로그아웃이 로컬 정리에 실패하면 안내를 띄우고 로그인 상태를 유지한다', async () => {
  restoreSpringSession('member-7');
  (logoutSpringSession as jest.Mock).mockRejectedValueOnce(
    new LocalSessionCleanupError('cleanup failed'),
  );
  const renderer = await renderAfterSplash();
  await ReactTestRenderer.act(async () => {
    activeBar(renderer).props.onNavigate('my');
  });

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(MyPageScreen).props.onLogout();
  });

  expect(alertSpy).toHaveBeenCalledWith(
    '로그아웃 실패',
    '로그아웃하지 못했어요. 잠시 후 다시 시도해주세요.',
  );
  expect(renderer.root.findByType(MyPageScreen).props.isLogoutPending).toBe(false);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(0);
});

test('공유가 추출 실패로 끝나면 결과를 지우고 장소 추출 실패를 안내한다', async () => {
  restoreSpringSession();
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'failed-share-request',
    url: '',
    status: 'FAILED',
    transferStatus: 'API_FAILED',
    failureReason: 'PLACE_NOT_MATCHED',
    retryable: false,
    updatedAt: Date.now(),
  }]);
  await renderAfterSplash();
  await settleAsyncWork();

  expect(clearShareResult).toHaveBeenCalledWith('failed-share-request');
  expect(alertSpy).toHaveBeenCalledWith('장소 추출 실패', '공유한 콘텐츠의 장소를 추출하지 못했어요.');
});

test('세션이 없을 때 공유가 로그인 만료로 실패하면 로그인 화면으로 보내고 다시 로그인하도록 안내한다', async () => {
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'expired-guest-share-request',
    url: '',
    status: 'FAILED',
    transferStatus: 'API_FAILED',
    failureReason: 'AUTH401_001 | 인증 토큰이 유효하지 않습니다. | HTTP_401',
    retryable: false,
    updatedAt: Date.now(),
  }]);
  const renderer = await renderAfterSplash();
  await settleAsyncWork();

  expect(alertSpy).toHaveBeenCalledWith('로그인이 필요해요', '다시 로그인한 뒤 게시물을 공유해 주세요.');
  expect(alertSpy).not.toHaveBeenCalledWith('공유한 게시물을 저장하지 못했어요', expect.anything());
  // 세션이 없으면 온보딩이 먼저 보이고, 마치면 로그인 화면이다.
  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
});

test('세션이 끝나면(로그아웃, 탈퇴) 보관함 목록 캐시를 비워 다음 회원에게 이전 목록이 보이지 않게 한다', async () => {
  restoreSpringSession('member-1');
  const renderer = await renderAfterSplash();
  expect(clearSavedPlacesCache).not.toHaveBeenCalled();

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', 'member-1');
    await Promise.resolve();
  });
  expect(clearSavedPlacesCache).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(OnboardingScreen)).toHaveLength(1);
});

test('로그인 만료 공유 결과를 처리하다 세션을 읽지 못하면 로그인 화면으로 보내고 다시 로그인하도록 안내한다', async () => {
  // 세션 저장소를 아예 읽지 못한다. 부트 확인은 읽기 실패를 세션 없음으로 다루고, 공유 결과 처리는 실패 갈래를 탄다.
  (getSpringTokens as jest.Mock).mockRejectedValue(new Error('keychain unavailable'));
  (getShareResults as jest.Mock).mockResolvedValueOnce([{
    requestId: 'expired-share-unreadable-session',
    url: '',
    status: 'FAILED',
    transferStatus: 'API_FAILED',
    failureReason: 'AUTH401_001 | 인증 토큰이 유효하지 않습니다. | HTTP_401',
    retryable: false,
    updatedAt: Date.now(),
  }]);
  const renderer = await renderAfterSplash();
  await settleAsyncWork();

  expect(clearShareResult).toHaveBeenCalledWith('expired-share-unreadable-session');
  expect(alertSpy).toHaveBeenCalledWith('로그인이 필요해요', '다시 로그인한 뒤 게시물을 공유해 주세요.');
  await completeOnboarding(renderer);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
});
