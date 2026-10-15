import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import App from '../App';
import {
  getSpringMemberId,
  getSpringTokens,
  onSpringSessionChange,
} from '../src/lib/auth/spring-session';
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
import {HistoryScreen} from '../src/pages/history/HistoryScreen';
import {AccountDeletionScreen} from '../src/pages/my-page/AccountDeletionScreen';
import {MyPageScreen} from '../src/pages/my-page/MyPageScreen';
import {deleteAccount, getLinkedDeletionProviders} from '../src/lib/auth/deleteAccount';
import {BottomNavigationBar} from '../src/components/BottomNavigationBar';
import {ONBOARDING_HISTORY_REEL} from '../src/entities/onboarding/data';
import {clearShareResult, getShareResults, resumeWaitingShares} from '../src/lib/share-intent';
import {getAppUpdatePolicy} from '../src/lib/app-update-policy';
import {AppUpdateModal} from '../src/components/AppUpdateModal';
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
  hasCompletedAppGuide: jest.fn(),
  completeAppGuide: jest.fn(),
  hasSignedInOnThisInstall: jest.fn(),
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

jest.mock('../src/entities/onboarding/transfer', () => ({
  beginGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  cancelGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  resumeGuestOnboardingTransfer: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../src/lib/auth/signInWithGoogle', () => ({
  signInWithGoogle: jest.fn(() => Promise.resolve({member: {id: 1}})),
}));

jest.mock('../src/lib/auth/deleteAccount', () => ({
  deleteAccount: jest.fn(() => Promise.resolve()),
  getLinkedDeletionProviders: jest.fn(() => []),
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

jest.mock('../src/pages/my-page/AccountDeletionScreen', () => ({
  AccountDeletionScreen: () => null,
}));

type AuthChangeHandler = (event: string, memberId: string | null) => void;

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
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(false);
  (completeAppGuide as jest.Mock).mockResolvedValue(undefined);
  (hasSignedInOnThisInstall as jest.Mock).mockResolvedValue(false);
  (rememberSignInOnThisInstall as jest.Mock).mockResolvedValue(undefined);
  (getCurrentProfile as jest.Mock).mockReset().mockResolvedValue(null);
  (beginGuestOnboardingTransfer as jest.Mock).mockResolvedValue(undefined);
  (resumeGuestOnboardingTransfer as jest.Mock).mockResolvedValue(false);
  (signInWithGoogle as jest.Mock).mockResolvedValue({member: {id: 1}});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('나중에 선택한 버전은 앱 재시작 후에도 숨기고 새 버전은 다시 안내한다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  (getAppUpdatePolicy as jest.Mock).mockResolvedValue({
    updateRequired: false,
    updateRecommended: true,
    minimumSupportedVersion: '1.1.0',
    latestVersion: '1.2.0',
    storeUrl: 'https://example.com/store',
  });

  const renderer = await renderAfterSplash();
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

  const afterRestart = await renderAfterSplash();
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
  const withNewVersion = await renderAfterSplash();
  expect(
    withNewVersion.root.findAllByType(AppUpdateModal).find(
      modal => modal.props.mode === 'recommended',
    )?.props.visible,
  ).toBe(true);
  await ReactTestRenderer.act(async () => withNewVersion.unmount());
});

test('닫은 버전이어도 필수 업데이트는 표시한다', async () => {
  await AsyncStorage.setItem(DISMISSED_RECOMMENDED_VERSION_KEY, '1.2.0');
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
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
    // 토큰 회전은 화면 흐름을 바꾸지 않습니다.
    authChangeHandler('TOKEN_REFRESHED', null);
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

test('비회원도 히스토리와 내 정보 화면을 열 수 있다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(BottomNavigationBar).props.onNavigate('history');
  });
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  expect(renderer.root.findByType(BottomNavigationBar).props.isGuest).toBe(true);
  const historyProps = renderer.root.findByType(HistoryScreen).props;
  expect(historyProps.guestReels).toEqual([ONBOARDING_HISTORY_REEL]);
  expect(historyProps.guestReels[0].processing_status).toBe('COMPLETED');
  expect(historyProps.guestDetails[ONBOARDING_HISTORY_REEL.id].extraction.extraction_places).toHaveLength(5);

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
  restoreSpringSession();
  const renderer = await renderAfterSplash();
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
  });
  expect(renderer.root.findAllByType(SavedPlacesScreen)).toHaveLength(0);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('v1 공유 추출이 완료되고 saveMode가 없어도 보관함을 연다', async () => {
  (hasCompletedAppGuide as jest.Mock).mockResolvedValue(true);
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
    authChangeHandler('SIGNED_IN', 'user');
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

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'new-user');
    await Promise.resolve();
  });

  // TODO(spring-migration): 온보딩 이전 API를 Spring으로 옮기기 전까지 이어 받기는 멈춰 둡니다.
  expect(resumeGuestOnboardingTransfer).not.toHaveBeenCalled();
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(false);
  expect(renderer.root.findByType(SavedPlacesScreen).props.places).toBeUndefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('이전에 로그인한 기기에서도 새 계정 로그인 시 군자역 전환을 시작한다', async () => {
  (hasSignedInOnThisInstall as jest.Mock).mockResolvedValue(true);
  const renderer = await renderAfterSplash();

  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(1);
  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(LoginScreen).props.onContinueWithGoogle();
  });
  expect(beginGuestOnboardingTransfer).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_IN', 'another-new-user');
    await Promise.resolve();
  });
  expect(resumeGuestOnboardingTransfer).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('회원 탈퇴 직후 재가입에서도 군자역 전환을 시작한다', async () => {
  (hasSignedInOnThisInstall as jest.Mock).mockResolvedValue(true);
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
  expect(beginGuestOnboardingTransfer).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('재설치로 앱 기록이 없으면 세션이 복원되어도 온보딩을 보여준다', async () => {
  restoreSpringSession();
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
  restoreSpringSession();
  const renderer = await renderAfterSplash();

  await ReactTestRenderer.act(async () => {
    authChangeHandler('SIGNED_OUT', null);
    renderer.root.findByType(AppGuideScreen).props.onComplete();
  });
  expect(renderer.root.findByType(SavedPlacesScreen).props.isGuest).toBe(true);
  expect(renderer.root.findAllByType(LoginScreen)).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
