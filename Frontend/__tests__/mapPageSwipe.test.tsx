import React from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { Place } from '../src/entities/place/types';
import { SwipeBackStack } from '../src/components/navigation/SwipeBackStack';
import {
  PlaceResultSheet,
  type MapSheetPage,
} from '../src/pages/map/components/PlaceResultSheet';
import { PlaceDetailContent } from '../src/pages/place-detail/components/PlaceDetailContent';

jest.mock('posthog-react-native', () => ({ usePostHog: () => null }));
jest.mock('../src/components/SearchBar', () => ({
  SEARCH_BAR_HEIGHT: 44,
  SEARCH_BAR_TOP_GAP: 16,
}));
jest.mock('../src/pages/place-detail/components/PlaceDetailContent', () => ({
  PlaceDetailContent: () => null,
}));
jest.mock(
  '../src/pages/place-detail/components/PlaceDetailActionSheet',
  () => ({ PlaceDetailActionSheet: () => null }),
);

const place: Place = {
  id: 'one',
  name: '테스트 카페',
  address: '서울',
  fullAddress: '서울 광진구',
};
const places = [place];
const guestReelsByPlace = { one: [] };
const renderPage = (sheet: React.ReactNode, page: MapSheetPage) => (
  <View testID={`map-frame-${page.isDetail ? 'detail' : 'list'}`}>
    <Text>지도 배경</Text>
    <Text>검색창</Text>
    {sheet}
    <Text>하단 메뉴</Text>
  </View>
);
async function render(
  overrides: Partial<React.ComponentProps<typeof PlaceResultSheet>> = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <PlaceResultSheet
        pageHeight={800}
        bottomTabOffset={80}
        places={places}
        guestReelsByPlace={guestReelsByPlace}
        renderPage={renderPage}
        {...overrides}
      />,
    );
  });
  return renderer;
}
async function openDetail(renderer: TestRenderer.ReactTestRenderer) {
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: '테스트 카페 상세 보기' })
      .props.onPress(),
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'spring').mockImplementation((value, config) => ({
    start: callback => {
      (value as Animated.Value).setValue(config.toValue as number);
      callback?.({ finished: true });
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('핀 상세 진입과 복귀 중 공유 지도는 한 인스턴스를 유지한다', async () => {
  const mount = jest.fn();
  const unmount = jest.fn();
  function NativeMap({ selectedId }: { selectedId: string | null }) {
    React.useEffect(() => {
      mount();
      return () => unmount();
    }, []);
    return <View testID="shared-map" accessibilityLabel={selectedId ?? ''} />;
  }
  const renderer = await render({
    renderMap: page => <NativeMap selectedId={page.place?.id ?? null} />,
  });
  const map = renderer.root.findByType(NativeMap);
  expect(
    renderer.root.findByType(SwipeBackStack).findAllByType(NativeMap),
  ).toHaveLength(0);
  for (let entry = 0; entry < 2; entry += 1) {
    await openDetail(renderer);
    expect(renderer.root.findByType(NativeMap)).toBe(map);
    expect(map.props.selectedId).toBe(place.id);
    await act(async () =>
      renderer.root.findByType(SwipeBackStack).props.onBack(),
    );
    expect(renderer.root.findByType(NativeMap)).toBe(map);
    expect(map.props.selectedId).toBeNull();
  }
  expect(mount).toHaveBeenCalledTimes(1);
  expect(unmount).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
  expect(unmount).toHaveBeenCalledTimes(1);
});

test('스와이프 레이어가 지도·검색창·시트·하단 메뉴 전체를 포함하고 목록 인스턴스를 유지한다', async () => {
  const renderer = await render();
  const originalList = renderer.root.findByType(FlatList);
  await openDetail(renderer);
  const stack = renderer.root.findByType(SwipeBackStack);
  expect(stack.props.activeKey).toBe('detail');
  expect(stack.props.backKey).toBe('list');
  const foreground = renderer.root.findByProps({
    testID: 'back-screen-detail',
  });
  expect(foreground.findByProps({ testID: 'map-frame-detail' })).toBeDefined();
  expect(
    foreground.findAllByType(Text).map(node => node.props.children),
  ).toEqual(expect.arrayContaining(['지도 배경', '검색창', '하단 메뉴']));
  await act(async () => stack.props.onBack());
  expect(renderer.root.findByType(SwipeBackStack).props.activeKey).toBe('list');
  expect(renderer.root.findByType(FlatList)).toBe(originalList);
  await openDetail(renderer);
  expect(
    renderer.root.findByProps({ testID: 'back-screen-detail' }).props
      .pointerEvents,
  ).toBe('auto');
  await act(async () => renderer.unmount());
});

test('중간 높이에서 펼친 상세의 첫 뒤로가기는 기존 <와 동일하게 시트 높이만 복원한다', async () => {
  const renderer = await render();
  await openDetail(renderer);
  if (renderer.root.findByType(SwipeBackStack).props.backKey === 'state-back') {
    await act(async () =>
      renderer.root.findByType(PlaceDetailContent).props.onBack(),
    );
  }
  const detailFrame = renderer.root.findByProps({ testID: 'map-frame-detail' });
  const handle = detailFrame.findByProps({
    accessibilityLabel: '검색 결과 펼치기',
  });
  await act(async () => handle.props.onPress());
  const expandedStack = renderer.root.findByType(SwipeBackStack);
  expect(expandedStack.props.enabled).toBe(true);
  expect(expandedStack.props.backKey).toBe('state-back');
  const preview = renderer.root.findByProps({
    testID: 'back-screen-state-back',
  });
  expect(preview.findByProps({ testID: 'map-frame-detail' })).toBeDefined();
  expect(preview.findAllByType(Text).map(node => node.props.children)).toEqual(
    expect.arrayContaining(['지도 배경', '검색창', '하단 메뉴']),
  );
  const detail = renderer.root
    .findByProps({ testID: 'back-screen-detail' })
    .findByType(PlaceDetailContent);
  const oldTransition = expandedStack.props.transitionKey;
  await act(async () => expandedStack.props.onBack());
  expect(renderer.root.findByType(SwipeBackStack).props.transitionKey).not.toBe(
    oldTransition,
  );
  expect(
    renderer.root
      .findByProps({ testID: 'back-screen-detail' })
      .findByType(PlaceDetailContent),
  ).toBe(detail);
  expect(renderer.root.findByType(SwipeBackStack).props.activeKey).toBe(
    'detail',
  );
  expect(renderer.root.findByType(SwipeBackStack).props.enabled).toBe(true);
  await act(async () =>
    renderer.root.findByType(SwipeBackStack).props.onBack(),
  );
  expect(renderer.root.findByType(SwipeBackStack).props.activeKey).toBe('list');
  await act(async () => renderer.unmount());
});

test('드래그로 전체 목록에 도달하면 손을 놓기 전부터 뒤로가기 상태도 전체 높이가 된다', async () => {
  const create = jest.spyOn(PanResponder, 'create');
  const translateY = new Animated.Value(336);
  const setValue = jest.spyOn(translateY, 'setValue');
  const renderer = await render({ translateY });
  const handlers = create.mock.calls[0][0];
  let reportStoppedPosition: ((value: number) => void) | undefined;
  jest.spyOn(translateY, 'stopAnimation').mockImplementation(callback => {
    reportStoppedPosition = callback;
  });
  const event = {} as GestureResponderEvent;
  const pan = { dy: -300, dx: 0, vy: -1 } as PanResponderGestureState;
  await act(async () => handlers.onPanResponderGrant?.(event, pan));
  await act(async () => handlers.onPanResponderMove?.(event, pan));
  const full = renderer.root.findByType(SwipeBackStack);
  expect(full.props.transitionKey).toBe('0:');
  expect(full.props.backKey).toBe('state-back');
  expect(full.props.gestureRegion.top).toBe(0);
  // The native stop callback can arrive after the list has reached the top.
  await act(async () => reportStoppedPosition?.(336));
  await act(async () => handlers.onPanResponderTerminate?.(event, pan));
  expect(renderer.root.findByType(SwipeBackStack).props.transitionKey).toBe('0:');
  expect(setValue).toHaveBeenLastCalledWith(0);
  await act(async () => renderer.unmount());
});

test('접힌 목록에서 마커 상세를 열어도 뒤 목록은 복귀 높이에 고정되고 복귀 후 내려가지 않는다', async () => {
  const renderer = await render();
  const props = renderer.root.findByType(PlaceResultSheet)
    .props as React.ComponentProps<typeof PlaceResultSheet>;
  await act(async () =>
    renderer.update(<PlaceResultSheet {...props} collapseSignal={1} />),
  );
  const getListTranslation = () => {
    const stack = renderer.root.findByType(SwipeBackStack);
    const frame = stack.props.screens.find(
      (screen: { key: string }) => screen.key === 'list',
    ).content;
    const sheet = frame.props.children[2];
    return StyleSheet.flatten(sheet.props.style).transform[0].translateY;
  };
  const listTranslation = getListTranslation();
  expect(listTranslation.__getValue()).toBe(585);
  await act(async () =>
    renderer.update(
      <PlaceResultSheet
        {...props}
        collapseSignal={1}
        openPlace={place}
        openPlaceSignal={1}
      />,
    ),
  );
  expect(renderer.root.findByType(SwipeBackStack).props.activeKey).toBe(
    'detail',
  );
  // Check the native node, not only the numeric destination passed to render.
  expect(getListTranslation()).toBe(listTranslation);
  expect(listTranslation.__getValue()).toBe(585);
  const springsBeforeBack = jest.mocked(Animated.spring).mock.calls.length;
  await act(async () =>
    renderer.root.findByType(SwipeBackStack).props.onBack(),
  );
  expect(renderer.root.findByType(SwipeBackStack).props.activeKey).toBe('list');
  expect(getListTranslation()).toBe(listTranslation);
  expect(listTranslation.__getValue()).toBe(585);
  expect(jest.mocked(Animated.spring).mock.calls.length).toBe(
    springsBeforeBack,
  );
  await act(async () => renderer.unmount());
});
