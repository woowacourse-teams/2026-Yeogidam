import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {ScrollView, View} from 'react-native';

import {
  BAR_HIDE_DOWN_DISTANCE,
  BAR_REVEAL_UP_DISTANCE,
  INITIAL_BAR_SCROLL_STATE,
  reduceBarScroll,
  type BarScrollState,
} from '../src/pages/saved-places/components/SavedPlacesStickyBar';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';

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
  getRecentSearches: jest.fn(() => Promise.resolve([])),
  setRecentSearches: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: jest.fn(() => Promise.resolve([])),
  deleteSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(),
  normalizeInstagramContentUrl: (value: string) => value,
  saveContent: jest.fn(),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(() => Promise.resolve({reels: [], nextCursor: null})),
}));

const scrollTo = (state: BarScrollState, y: number, metrics?: Parameters<typeof reduceBarScroll>[2]) =>
  reduceBarScroll(state, y, metrics);

describe('reduceBarScroll', () => {
  test('맨 위에서는 항상 보인다', () => {
    const hidden = {...INITIAL_BAR_SCROLL_STATE, lastY: 200, visible: false};
    expect(scrollTo(hidden, 0).visible).toBe(true);
    expect(scrollTo(hidden, -30).visible).toBe(true); // 당겨서 새로고침
  });

  test('아래로 충분히 내리면 숨기고, 위로 살짝만 올려도 바로 보여 준다', () => {
    let state: BarScrollState = {...INITIAL_BAR_SCROLL_STATE, lastY: 100};
    state = scrollTo(state, 100 + BAR_HIDE_DOWN_DISTANCE);
    expect(state.visible).toBe(false);

    state = scrollTo(state, state.lastY - (BAR_REVEAL_UP_DISTANCE - 1));
    expect(state.visible).toBe(false); // 아직 너무 조금 올림

    state = scrollTo(state, state.lastY - 1);
    expect(state.visible).toBe(true); // 위로 4px 누적
  });

  test('아주 조금 아래로 움직인 정도로는 숨기지 않는다', () => {
    const state = scrollTo({...INITIAL_BAR_SCROLL_STATE, lastY: 100}, 105);
    expect(state.visible).toBe(true);
  });

  test('방향이 바뀌면 누적을 새로 시작한다', () => {
    let state: BarScrollState = {...INITIAL_BAR_SCROLL_STATE, lastY: 100};
    state = scrollTo(state, 108); // 아래로 8 (숨김 기준 미만)
    state = scrollTo(state, 106); // 위로 2 → 새로 시작
    expect(state.accumulated).toBe(-2);
    expect(state.visible).toBe(true);
  });

  test('한 번에 크게 튄 스크롤(위치 복원)은 방향으로 보지 않는다', () => {
    const state = scrollTo({...INITIAL_BAR_SCROLL_STATE, lastY: 0}, 800);
    expect(state.visible).toBe(true);
    expect(state.accumulated).toBe(0);
  });

  test('목록 맨 아래에서 튕겨 돌아오는 움직임은 무시한다', () => {
    const hidden = {...INITIAL_BAR_SCROLL_STATE, lastY: 1000, visible: false};
    const state = scrollTo(hidden, 990, {contentHeight: 1500, viewportHeight: 600});
    expect(state.visible).toBe(false);
  });
});

test('화면이 스크롤 이벤트를 받아도 오류 없이 동작한다', async () => {
  const errors: unknown[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args);
  });
  const places = [
    {id: '1', name: 'A', address: 'a', fullAddress: 'a'},
    {id: '2', name: 'B', address: 'b', fullAddress: 'b'},
  ];
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesScreen onOpenDetail={jest.fn()} places={places as never} />,
    );
  });
  const placeholder = renderer.root.findAll(
    node => node.type === View && typeof node.props.onLayout === 'function',
  )[0];
  await ReactTestRenderer.act(async () => {
    placeholder.props.onLayout({
      nativeEvent: {layout: {x: 0, y: 300, width: 350, height: 100}},
    });
  });
  const scroll = renderer.root.findByType(ScrollView);
  for (const y of [0, 120, 260, 400, 380, 360, 600, -30]) {
    await ReactTestRenderer.act(async () => {
      scroll.props.onScroll({
        nativeEvent: {
          contentOffset: {y},
          contentSize: {height: 2000},
          layoutMeasurement: {height: 800},
        },
      });
    });
  }
  spy.mockRestore();
  expect(errors).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
