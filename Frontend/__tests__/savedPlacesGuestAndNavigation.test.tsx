import React from 'react';

import {SwipeBackStack} from '../src/components/navigation/SwipeBackStack';
import {SavedPlacesEmptyState} from '../src/pages/saved-places/components/SavedPlacesEmptyState';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {CAFE} from './support/savedPlacesFixtures';
import {
  act,
  dialog,
  header,
  pressLabel,
  render,
  renderLoaded,
  searchPanel,
  setUpSavedPlacesScreenTests,
  texts,
  type Renderer,
} from './support/savedPlacesHarness';

// 비회원 보관함의 로그인 안내와, 보관함 화면이 App의 화면 이력(뒤로 가기)과 어떻게 이어지는지 확인합니다.
// 목록 읽기와 편집, 링크 저장은 savedPlacesScreen.test.tsx가 맡습니다.

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../src/components/BottomNavigationBar', () => ({
  BOTTOM_NAVIGATION_BAR_HEIGHT: 64,
  bottomNavigationBarContainerStyle: {},
  getBottomNavigationBarOffset: () => 0,
}));
jest.mock('../src/analytics/savedPlaceEvents', () => ({
  captureSavedPlaceSelected: jest.fn(),
  captureSavedPlacesViewed: jest.fn(),
}));
jest.mock('../src/lib/searchHistoryStorage', () => ({
  getRecentSearches: jest.fn(),
  setRecentSearches: jest.fn(),
}));
jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: jest.fn(),
  deleteSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(),
  normalizeInstagramContentUrl: (value: string) => value.trim(),
  saveContent: jest.fn(),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
}));

setUpSavedPlacesScreenTests();

const stack = (renderer: Renderer) => renderer.root.findByType(SwipeBackStack).props;
const lastBackState = (onNestedBackStateChange: jest.Mock) =>
  onNestedBackStateChange.mock.calls[onNestedBackStateChange.mock.calls.length - 1][0];

describe('비회원 로그인 안내', () => {
  test('장소 링크 추가를 누르면 로그인 안내를 띄우고 로그인 요청은 하지 않는다', async () => {
    const onShowGuestLoginPrompt = jest.fn();
    const onRequireLogin = jest.fn();
    const renderer = await render({isGuest: true, places: [], onShowGuestLoginPrompt, onRequireLogin});

    await pressLabel(renderer, '장소 링크 추가');
    expect(onShowGuestLoginPrompt).toHaveBeenCalledTimes(1);
    expect(onRequireLogin).not.toHaveBeenCalled();
    expect(dialog(renderer).props.visible).toBe(false);
  });

  test('빈 보관함은 비회원 문구와 함께 로그인하기로 로그인을 요청하고, 저장 방법 안내 카드로 가이드를 연다', async () => {
    const onAuthenticationRequired = jest.fn();
    const onOpenGuide = jest.fn();
    const renderer = await render({isGuest: true, places: [], onAuthenticationRequired, onOpenGuide});

    expect(renderer.root.findByType(SavedPlacesEmptyState).props).toMatchObject({
      isGuest: true,
      onLogin: onAuthenticationRequired,
      onOpenGuide,
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('로그인하고 마음에 드는 장소를');
    await pressLabel(renderer, '보관함 로그인');
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);

    // 안내 카드는 로그인 버튼의 자리를 받은 뒤 그 아래에 그린다.
    const loginButton = renderer.root.find(
      node => node.props.accessibilityLabel === '보관함 로그인' && typeof node.props.onLayout === 'function',
    );
    await act(async () => loginButton.props.onLayout({nativeEvent: {layout: {y: 250, height: 48}}}));
    await pressLabel(renderer, '저장 방법 알아보기');
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  test('회원의 빈 보관함에는 로그인 버튼이 없고 회원 문구를 보인다', async () => {
    const renderer = await renderLoaded([]);
    expect(renderer.root.findByType(SavedPlacesEmptyState).props.isGuest).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain('인스타그램 릴스를 공유하고');
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '보관함 로그인')).toHaveLength(0);
  });
});

describe('화면 이력과 뒤로 가기', () => {
  test('검색을 열면 이력 스택에 검색이 쌓이고 뒤로 갈 수 있다고 알리며, 스와이프 뒤로 가기로 닫으면 아니라고 알린다', async () => {
    const onNestedBackStateChange = jest.fn();
    const renderer = await renderLoaded([CAFE], {onNestedBackStateChange});
    expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null, enabled: true});
    expect(lastBackState(onNestedBackStateChange)).toBe(false);

    await act(async () => header(renderer).props.onPressSearch());
    expect(stack(renderer)).toMatchObject({activeKey: 'search', backKey: 'list'});
    expect(searchPanel(renderer)).toBeDefined();
    expect(lastBackState(onNestedBackStateChange)).toBe(true);

    await act(async () => stack(renderer).onBack());
    expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null});
    expect(renderer.root.findAllByType(SwipeBackStack)[0].props.screens).toHaveLength(1);
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
  });

  test('편집 중에는 뒤로 갈 수 있다고 알리고 뒤로 가기로 편집을 끄며, 화면이 보이지 않으면 아니라고 알린다', async () => {
    const onNestedBackStateChange = jest.fn();
    const onOpenDetail = jest.fn();
    const renderer = await renderLoaded([CAFE], {onNestedBackStateChange, onOpenDetail});

    await pressLabel(renderer, '보관함 편집');
    expect(lastBackState(onNestedBackStateChange)).toBe(true);
    await act(async () => stack(renderer).onBack());
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
    expect(texts(renderer)).toContain('편집');
    expect(texts(renderer)).not.toContain('취소');

    await pressLabel(renderer, '보관함 편집');
    expect(lastBackState(onNestedBackStateChange)).toBe(true);
    await act(async () => {
      renderer.update(
        <SavedPlacesScreen
          onOpenDetail={onOpenDetail}
          onNestedBackStateChange={onNestedBackStateChange}
          isActive={false}
        />,
      );
    });
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
    expect(stack(renderer).enabled).toBe(false);
  });
});
