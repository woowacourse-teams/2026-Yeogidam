import React, { useEffect, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  Text,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SwipeBackStack } from '../src/components/navigation/SwipeBackStack';
import { AppModal } from '../src/components/AppModal';

const event = {} as GestureResponderEvent;
const gesture = (dx: number, vx = 0.1, x0 = 5, dy = 0) =>
  ({ dx, vx, x0, dy } as PanResponderGestureState);
const mounts = jest.fn();
const unmounts = jest.fn();
const frames = new Map<number, (timestamp: number) => void>();
let frameId = 0;
function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
}
function Screen({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    mounts(name);
    return () => {
      unmounts(name);
    };
  }, [name]);
  return (
    <Pressable testID={`increment-${name}`} onPress={() => setCount(count + 1)}>
      <Text>
        {name}:{count}
      </Text>
    </Pressable>
  );
}
const screens = [
  { key: 'saved', content: <Screen name="saved" /> },
  { key: 'map', content: <Screen name="map" /> },
];
function translation(renderer: TestRenderer.ReactTestRenderer, key: string) {
  const screen = renderer.root.findByProps({ testID: `back-screen-${key}` });
  const animated = screen.findAll(node => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.transform?.some(
      (item: { translateX?: unknown }) => item.translateX !== undefined,
    );
  })[0];
  return StyleSheet.flatten(animated.props.style).transform[0].translateX;
}
function routeOpacity(renderer: TestRenderer.ReactTestRenderer, key: string) {
  const screen = renderer.root.findByProps({ testID: `back-screen-${key}` });
  const animated = screen.findAll(node =>
    StyleSheet.flatten(node.props.style)?.transform !== undefined,
  )[0];
  return StyleSheet.flatten(animated.props.style).opacity;
}

beforeEach(() => {
  jest.clearAllMocks();
  frames.clear();
  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation(callback => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
    if (id != null) frames.delete(id);
  });
  jest.spyOn(PanResponder, 'create');
  for (const method of ['timing', 'spring'] as const) {
    jest.spyOn(Animated, method).mockImplementation((value, config) => ({
      start: callback => {
        (value as Animated.Value).setValue(config.toValue as number);
        callback?.({ finished: true });
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));
  }
});
afterEach(() => jest.restoreAllMocks());
async function render() {
  const onBack = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SwipeBackStack
        screens={screens}
        activeKey="map"
        backKey="saved"
        onBack={onBack}
      />,
    );
  });
  return {
    renderer,
    onBack,
    handlers: jest.mocked(PanResponder.create).mock.calls[0][0],
  };
}
test('스와이프 중 실제 이전 콘텐츠를 유지하고 복귀할 때 상태와 네이티브 화면을 재사용한다', async () => {
  const { renderer, handlers, onBack } = await render();
  await act(async () =>
    renderer.root.findByProps({ testID: 'increment-saved' }).props.onPress(),
  );
  const previous = renderer.root.findByProps({ testID: 'back-screen-saved' });
  const savedTranslation = translation(renderer, 'saved');
  expect(previous.props.pointerEvents).toBe('none');
  expect(previous.findByType(Text).props.children).toEqual(['saved', ':', 1]);
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderMove?.(event, gesture(250));
  });
  expect(onBack).not.toHaveBeenCalled();
  await act(async () => handlers.onPanResponderRelease?.(event, gesture(250)));
  expect(onBack).toHaveBeenCalledTimes(1);
  await act(async () =>
    renderer.update(
      <SwipeBackStack screens={screens} activeKey="saved" onBack={onBack} />,
    ),
  );
  expect(
    renderer.root.findByProps({ testID: 'back-screen-saved' }).props
      .pointerEvents,
  ).toBe('auto');
  expect(
    renderer.root.findByProps({ testID: 'back-screen-saved' }).findByType(Text)
      .props.children,
  ).toEqual(['saved', ':', 1]);
  expect(translation(renderer, 'saved')).toBe(savedTranslation);
  expect(translation(renderer, 'saved').__getValue()).toBe(0);
  // The outgoing screen stays offscreen until its hidden state is committed.
  expect(translation(renderer, 'map').__getValue()).toBeGreaterThan(0);
  await act(async () => flushFrames());
  expect(translation(renderer, 'map').__getValue()).toBe(0);
  expect(mounts).toHaveBeenCalledTimes(2);
  expect(unmounts).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
test('짧거나 중단된 스와이프는 현재 화면을 복원하고 다음 제스처를 받는다', async () => {
  const { renderer, handlers, onBack } = await render();
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderMove?.(event, gesture(24));
    handlers.onPanResponderRelease?.(event, gesture(24));
  });
  expect(onBack).not.toHaveBeenCalled();
  expect(
    handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(15)),
  ).toBe(true);
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderTerminate?.(event, gesture(150));
  });
  expect(onBack).not.toHaveBeenCalled();
  expect(
    renderer.root.findByProps({ testID: 'back-screen-map' }).props
      .pointerEvents,
  ).toBe('auto');
  await act(async () => renderer.unmount());
});
test('가장자리 바깥·세로 스크롤과 중복 뒤로가기·루트 스와이프를 가로채지 않는다', async () => {
  const { renderer, handlers, onBack } = await render();
  expect(
    handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(20, 0.1, 80)),
  ).toBe(false);
  expect(
    handlers.onMoveShouldSetPanResponderCapture?.(
      event,
      gesture(20, 0.1, 5, 50),
    ),
  ).toBe(false);
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderRelease?.(event, gesture(45, 1));
  });
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(
    handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(20)),
  ).toBe(false);
  await act(async () =>
    renderer.update(
      <SwipeBackStack screens={screens} activeKey="saved" onBack={onBack} />,
    ),
  );
  expect(
    handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(20)),
  ).toBe(false);
  await act(async () => renderer.unmount());
});

test('목록보다 먼저 가장자리 터치를 받고 취소 후에도 다시 스와이프할 수 있다', async () => {
  const { renderer, handlers, onBack } = await render();
  const touchAt = (pageX: number) =>
    ({ nativeEvent: { pageX, pageY: 300 } } as GestureResponderEvent);
  const edge = touchAt(20);
  // GestureState.x0 is not initialized at touch-down; use native pageX.
  expect(
    handlers.onStartShouldSetPanResponderCapture?.(touchAt(100), gesture(0)),
  ).toBe(false);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect(
      handlers.onStartShouldSetPanResponderCapture?.(edge, gesture(0)),
    ).toBe(true);
    await act(async () => {
      handlers.onPanResponderGrant?.(edge, gesture(0));
      expect(handlers.onShouldBlockNativeResponder?.(edge, gesture(0))).toBe(
        true,
      );
      handlers.onPanResponderMove?.(edge, gesture(20));
      handlers.onPanResponderRelease?.(edge, gesture(20));
    });
    expect(handlers.onShouldBlockNativeResponder?.(edge, gesture(0))).toBe(
      false,
    );
  }
  expect(onBack).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

test('장식 애니메이션의 종료 통지가 없어도 뒤로가기를 확정하고 이전 화면의 입력을 복구한다', async () => {
  const { renderer, handlers, onBack } = await render();
  const foreground = translation(renderer, 'map');
  let finishForeground: (() => void) | undefined;
  jest.mocked(Animated.timing).mockImplementation((value, config) => ({
    start: callback => {
      (value as Animated.Value).setValue(config.toValue as number);
      if (value === foreground)
        finishForeground = () => callback?.({ finished: true });
      // Other native animations deliberately never invoke their completion.
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  onBack.mockImplementation(() => {
    renderer.update(
      <SwipeBackStack screens={screens} activeKey="saved" onBack={onBack} />,
    );
  });
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderMove?.(event, gesture(250));
    handlers.onPanResponderRelease?.(event, gesture(250));
  });
  expect(onBack).not.toHaveBeenCalled();
  expect(finishForeground).toBeDefined();
  await act(async () => finishForeground?.());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(
    renderer.root.findByProps({ testID: 'back-screen-saved' }).props
      .pointerEvents,
  ).toBe('auto');
  expect(
    renderer.root.findByProps({ testID: 'back-screen-map' }).props
      .pointerEvents,
  ).toBe('none');
  expect(handlers.onPanResponderTerminationRequest?.(event, gesture(0))).toBe(
    true,
  );
  expect(handlers.onShouldBlockNativeResponder?.(event, gesture(0))).toBe(
    false,
  );
  await act(async () =>
    renderer.root.findByProps({ testID: 'increment-saved' }).props.onPress(),
  );
  expect(
    renderer.root.findByProps({ testID: 'back-screen-saved' }).findByType(Text)
      .props.children,
  ).toEqual(['saved', ':', 1]);
  await act(async () => renderer.unmount());
});

test('상세를 닫은 뒤 다른 상세를 열면 이전 네이티브 이동값을 재사용하지 않는다', async () => {
  const { renderer, handlers, onBack } = await render();
  const oldDetailTranslation = translation(renderer, 'map');
  onBack.mockImplementation(() => {
    renderer.update(
      <SwipeBackStack
        screens={[screens[0]]}
        activeKey="saved"
        onBack={onBack}
      />,
    );
  });
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderMove?.(event, gesture(250));
    handlers.onPanResponderRelease?.(event, gesture(250));
  });
  expect(
    renderer.root.findAllByProps({ testID: 'back-screen-map' }),
  ).toHaveLength(0);
  // Simulate the outgoing native view reporting its final offscreen position
  // after the JS route has already changed.
  oldDetailTranslation.setValue(402);
  await act(async () => {
    renderer.update(
      <SwipeBackStack
        screens={screens}
        activeKey="map"
        backKey="saved"
        onBack={onBack}
      />,
    );
  });
  expect(translation(renderer, 'map')).not.toBe(oldDetailTranslation);
  expect(translation(renderer, 'map').__getValue()).toBe(0);
  expect(
    renderer.root.findByProps({ testID: 'back-screen-map' }).props
      .pointerEvents,
  ).toBe('auto');
  await act(async () => renderer.unmount());
});

describe('버튼으로 화면을 열고 닫을 때의 전환', () => {
  const finishers: (() => void)[] = [];
  const animateMap = (key: string) => key === 'map';
  const routes = (key: 'saved' | 'map') => (
    <SwipeBackStack
      screens={key === 'map' ? screens : [screens[0]]}
      activeKey={key}
      backKey={key === 'map' ? 'saved' : null}
      onBack={jest.fn()}
      animateRoute={animateMap}
    />
  );
  const mountedMapScreens = (renderer: TestRenderer.ReactTestRenderer) =>
    renderer.root.findAll(
      node =>
        typeof node.type === 'string' && node.props.testID === 'back-screen-map',
    );
  const finishAnimations = () =>
    act(async () => {
      finishers.splice(0).forEach(finish => finish());
    });

  beforeEach(() => {
    finishers.length = 0;
    jest.mocked(Animated.timing).mockImplementation((value, config) => ({
      start: callback => {
        finishers.push(() => {
          (value as Animated.Value).setValue(config.toValue as number);
          callback?.({ finished: true });
        });
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));
  });

  async function renderRoute(key: 'saved' | 'map') {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(routes(key));
    });
    return renderer;
  }

  test('새 화면은 제자리에서 투명하게 시작해 나타난다', async () => {
    const renderer = await renderRoute('saved');
    await act(async () => renderer.update(routes('map')));

    expect(translation(renderer, 'map').__getValue()).toBe(0);
    expect(routeOpacity(renderer, 'map').__getValue()).toBe(0);
    await finishAnimations();
    expect(routeOpacity(renderer, 'map').__getValue()).toBe(1);
    await act(async () => renderer.unmount());
  });

  test('닫힌 화면은 애니메이션이 끝날 때까지 유지한 뒤 제거한다', async () => {
    const renderer = await renderRoute('map');
    await act(async () => renderer.update(routes('saved')));

    expect(
      mountedMapScreens(renderer),
    ).toHaveLength(1);
    expect(unmounts).not.toHaveBeenCalledWith('map');
    await finishAnimations();
    expect(
      mountedMapScreens(renderer),
    ).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  test('닫히는 중에 같은 화면을 다시 열어도 화면이 겹치지 않는다', async () => {
    const renderer = await renderRoute('map');
    await act(async () => renderer.update(routes('saved')));
    await act(async () => renderer.update(routes('map')));

    expect(
      mountedMapScreens(renderer),
    ).toHaveLength(1);
    await finishAnimations();
    expect(
      mountedMapScreens(renderer),
    ).toHaveLength(1);
    await act(async () => renderer.unmount());
  });

  test('대상이 아닌 화면은 전환 없이 바로 바뀐다', async () => {
    const renderer = await renderRoute('map');
    await act(async () =>
      renderer.update(
        <SwipeBackStack
          screens={[screens[0]]}
          activeKey="saved"
          onBack={jest.fn()}
          animateRoute={() => false}
        />,
      ),
    );

    expect(Animated.timing).not.toHaveBeenCalled();
    expect(
      mountedMapScreens(renderer),
    ).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});

test('스와이프로 닫은 화면은 닫힘 전환을 다시 하지 않는다', async () => {
  const onBack = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SwipeBackStack
        screens={screens}
        activeKey="map"
        backKey="saved"
        onBack={onBack}
        animateRoute={() => true}
      />,
    );
  });
  const handlers = jest.mocked(PanResponder.create).mock.calls[0][0];
  onBack.mockImplementation(() => {
    renderer.update(
      <SwipeBackStack
        screens={[screens[0]]}
        activeKey="saved"
        onBack={onBack}
        animateRoute={() => true}
      />,
    );
  });
  await act(async () => {
    handlers.onPanResponderGrant?.(event, gesture(10));
    handlers.onPanResponderMove?.(event, gesture(250));
    handlers.onPanResponderRelease?.(event, gesture(250));
  });

  expect(
    renderer.root.findAllByProps({ testID: 'back-screen-map' }),
  ).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('같은 페이지의 상태만 복원해도 애니메이션 위치와 터치 차단을 해제한다', async () => {
  const { renderer, handlers, onBack } = await render();
  const foreground = renderer.root.findByProps({ testID: 'back-screen-map' });
  for (let step = 1; step <= 2; step += 1) {
    await act(async () => {
      handlers.onPanResponderGrant?.(event, gesture(10));
      handlers.onPanResponderMove?.(event, gesture(250));
      handlers.onPanResponderRelease?.(event, gesture(250));
    });
    await act(async () =>
      renderer.update(
        <SwipeBackStack
          screens={screens}
          activeKey="map"
          backKey="saved"
          transitionKey={step}
          onBack={onBack}
        />,
      ),
    );
    expect(translation(renderer, 'map').__getValue()).toBe(0);
    expect(renderer.root.findByProps({ testID: 'back-screen-map' })).toBe(
      foreground,
    );
    expect(foreground.props.pointerEvents).toBe('auto');
    expect(
      handlers.onMoveShouldSetPanResponderCapture?.(event, gesture(15)),
    ).toBe(true);
    await act(async () => flushFrames());
  }
  expect(onBack).toHaveBeenCalledTimes(2);
  expect(unmounts).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

test('모달이 열려 있는 동안에는 가장자리 터치를 가져가지 않아 모달 안 버튼이 눌린다', async () => {
  const { renderer, handlers } = await render();
  const edge = {
    nativeEvent: { pageX: 20, pageY: 300 },
  } as GestureResponderEvent;
  const swipe = gesture(20, 0.1, 5);
  const modal = (visible: boolean) => (
    <AppModal visible={visible}>
      <Text>modal</Text>
    </AppModal>
  );
  let modalRenderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    modalRenderer = TestRenderer.create(modal(true));
  });
  expect(handlers.onStartShouldSetPanResponderCapture?.(edge, gesture(0))).toBe(
    false,
  );
  expect(handlers.onMoveShouldSetPanResponderCapture?.(edge, swipe)).toBe(
    false,
  );

  await act(async () => modalRenderer.update(modal(false)));
  expect(handlers.onStartShouldSetPanResponderCapture?.(edge, gesture(0))).toBe(
    true,
  );
  expect(handlers.onMoveShouldSetPanResponderCapture?.(edge, swipe)).toBe(true);
  await act(async () => {
    modalRenderer.unmount();
    renderer.unmount();
  });
});
