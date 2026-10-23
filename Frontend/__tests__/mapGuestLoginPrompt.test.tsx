import React from 'react';
import {
  PanResponder,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {SwipeBackStack} from '../src/components/navigation/SwipeBackStack';
import {SearchBar} from '../src/components/SearchBar';
import {getPlaceReels, getSavedPlaces} from '../src/entities/info/api';
import type {SavedPlaceListItem} from '../src/entities/info/types';
import {MapScreen} from '../src/pages/map/MapScreen';
import {pressLabel} from './support/pressLabel';
import {renderTracked, settleAsyncWork, type Renderer} from './support/renderers';

// 지도 화면의 비회원 로그인 안내(검색창 누르기, 시트 펼치기, 시트 끌어 올리기)와
// App의 화면 이력(뒤로 가기)과 이어지는 상태 알림을 확인합니다. 시트 안의 전환과 지도 유지는 mapPageSwipe.test.tsx가 맡습니다.

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../spec/KakaoMapNativeComponent', () => 'KakaoMapNativeComponent');
jest.mock('../src/lib/location-permission', () => ({
  subscribeLocationPermission: jest.fn(() => () => undefined),
  checkLocationPermission: jest.fn(() => Promise.resolve(false)),
  ensureLocationPermission: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../src/entities/info/api', () => ({
  getPlaceReels: jest.fn(),
  getSavedPlaces: jest.fn(),
}));
// 상세 본문과 삭제 시트는 이 테스트와 관계가 없어 비웁니다.
jest.mock('../src/pages/place-detail/components/PlaceDetailContent', () => ({
  PlaceDetailContent: () => null,
}));
jest.mock('../src/pages/place-detail/components/PlaceDetailActionSheet', () => ({
  PlaceDetailActionSheet: () => null,
}));

const act = ReactTestRenderer.act;
const NATIVE_MAP = 'KakaoMapNativeComponent';

const CAFE_WITH_COORDINATES: SavedPlaceListItem = {
  id: 'saved-1',
  createdAt: '2026-10-01T00:00:00Z',
  place: {id: 'place-1', name: '카페', roadAddress: '서울 성동구', latitude: 37.5, longitude: 127.0},
};

type ScreenProps = React.ComponentProps<typeof MapScreen>;

/** 지도 화면을 그리고 높이를 알려 시트가 그려지게 합니다. */
async function renderMap(props: Partial<ScreenProps> = {}) {
  const renderer = await renderTracked(<MapScreen {...props} />);
  await act(async () => {
    renderer.root
      .findAll(node => node.type === View && typeof node.props.onLayout === 'function')[0]
      .props.onLayout({nativeEvent: {layout: {height: 800}}});
  });
  await settleAsyncWork();
  return renderer;
}

// jest.mock이 네이티브 지도를 문자열 호스트 컴포넌트로 바꿔 두므로 그 이름으로 찾습니다.
const nativeMap = (renderer: Renderer) =>
  renderer.root.findByType(NATIVE_MAP as unknown as React.ComponentType);
/** 목록 화면의 검색창입니다. 검색 중에는 뒤로 가기 미리보기 화면에도 검색창이 하나 더 그려지므로 목록 화면 안에서 찾습니다. */
const searchBar = (renderer: Renderer) =>
  renderer.root.findByProps({testID: 'back-screen-list'}).findByType(SearchBar);
const stack = (renderer: Renderer) => renderer.root.findByType(SwipeBackStack).props;
const lastBackState = (onNestedBackStateChange: jest.Mock) =>
  onNestedBackStateChange.mock.calls[onNestedBackStateChange.mock.calls.length - 1][0];

beforeEach(() => {
  jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([]);
  jest.mocked(getPlaceReels).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('비회원 로그인 안내', () => {
  test('검색창을 누르면 로그인 안내를 띄우고 저장 장소는 묻지 않으며, 회원의 검색창에는 누름 동작이 없다', async () => {
    const onShowGuestLoginPrompt = jest.fn();
    const guest = await renderMap({isGuest: true, onShowGuestLoginPrompt});
    await act(async () => searchBar(guest).props.onPress());
    expect(onShowGuestLoginPrompt).toHaveBeenCalledTimes(1);
    expect(getSavedPlaces).not.toHaveBeenCalled();

    const member = await renderMap({onShowGuestLoginPrompt});
    expect(searchBar(member).props.onPress).toBeUndefined();
    expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  });

  test('손잡이를 눌러 시트를 펼치면 로그인 안내를 띄우고, 회원은 띄우지 않는다', async () => {
    const onShowGuestLoginPrompt = jest.fn();
    const guest = await renderMap({isGuest: true, onShowGuestLoginPrompt});
    await pressLabel(guest, '검색 결과 펼치기');
    expect(onShowGuestLoginPrompt).toHaveBeenCalledTimes(1);

    const member = await renderMap({onShowGuestLoginPrompt});
    await pressLabel(member, '검색 결과 펼치기');
    expect(onShowGuestLoginPrompt).toHaveBeenCalledTimes(1);
  });

  test('시트를 조금 끌어 올리고 손을 떼면 펼쳐지지 않아도 로그인 안내를 띄운다', async () => {
    const create = jest.spyOn(PanResponder, 'create');
    const onShowGuestLoginPrompt = jest.fn();
    await renderMap({isGuest: true, onShowGuestLoginPrompt});
    // 시트가 손잡이에 거는 응답자가 먼저 만들어지고, 화면 이력 스택의 응답자는 그 뒤에 만들어진다.
    const handlers = create.mock.calls[0][0];
    const event = {} as GestureResponderEvent;
    await act(async () =>
      handlers.onPanResponderGrant?.(event, {dx: 0, dy: 0, vy: 0} as PanResponderGestureState),
    );
    // 펼쳐지는 거리(48)와 속도(0.35)에 못 미치는 끌기라, 펼침으로 띄우는 안내와 겹치지 않고 끌기로만 한 번 띄운다.
    await act(async () =>
      handlers.onPanResponderRelease?.(event, {dx: 0, dy: -20, vy: -0.1} as PanResponderGestureState),
    );
    expect(onShowGuestLoginPrompt).toHaveBeenCalledTimes(1);
  });
});

describe('화면 이력과 뒤로 가기', () => {
  test('핀을 눌러 상세를 열면 뒤로 갈 수 있다고 알리고, 스와이프 뒤로 가기로 닫으면 아니라고 알린다', async () => {
    jest.mocked(getSavedPlaces).mockResolvedValue([CAFE_WITH_COORDINATES]);
    const onNestedBackStateChange = jest.fn();
    const renderer = await renderMap({onNestedBackStateChange});
    expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null});
    expect(lastBackState(onNestedBackStateChange)).toBe(false);

    await act(async () =>
      nativeMap(renderer).props.onMarkerPressed({
        nativeEvent: {id: 'place-1', latitude: 37.5, longitude: 127.0, zoomLevel: 15, cameraBottomInset: 300},
      }),
    );
    await settleAsyncWork();
    expect(stack(renderer)).toMatchObject({activeKey: 'detail', backKey: 'list'});
    expect(lastBackState(onNestedBackStateChange)).toBe(true);

    await act(async () => stack(renderer).onBack());
    expect(stack(renderer)).toMatchObject({activeKey: 'list', backKey: null});
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
  });

  test('검색어를 넣으면 뒤로 갈 수 있다고 알리고, 검색창의 뒤로 가기로 지우면 아니라고 알린다', async () => {
    const onNestedBackStateChange = jest.fn();
    const renderer = await renderMap({onNestedBackStateChange});

    await act(async () => searchBar(renderer).props.onChangeText('카페'));
    expect(lastBackState(onNestedBackStateChange)).toBe(true);
    expect(searchBar(renderer).props.backButtonPosition).toBe('leading');

    await act(async () => searchBar(renderer).props.onPressBack());
    expect(searchBar(renderer).props.value).toBe('');
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
  });

  test('화면이 보이지 않으면 상세가 열려 있어도 뒤로 갈 수 있다고 알리지 않고 스와이프도 끈다', async () => {
    jest.mocked(getSavedPlaces).mockResolvedValue([CAFE_WITH_COORDINATES]);
    const onNestedBackStateChange = jest.fn();
    const renderer = await renderMap({onNestedBackStateChange});
    await act(async () =>
      nativeMap(renderer).props.onMarkerPressed({
        nativeEvent: {id: 'place-1', latitude: 37.5, longitude: 127.0, zoomLevel: 15, cameraBottomInset: 300},
      }),
    );
    await settleAsyncWork();
    expect(lastBackState(onNestedBackStateChange)).toBe(true);

    await act(async () => {
      renderer.update(<MapScreen onNestedBackStateChange={onNestedBackStateChange} isActive={false} />);
    });
    expect(lastBackState(onNestedBackStateChange)).toBe(false);
    expect(stack(renderer).enabled).toBe(false);
  });
});
