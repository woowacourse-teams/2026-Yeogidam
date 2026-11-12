import React from 'react';
import {Modal} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {WhatsNewModal} from '../src/components/WhatsNewModal';
import {WHATS_NEW} from '../src/lib/whats-new-content';

const safeAreaMetrics = {
  frame: {height: 800, width: 400, x: 0, y: 0},
  insets: {bottom: 34, left: 0, right: 0, top: 47},
};
const SEEN_KEY = `@yeogidam/seen-whats-new/${WHATS_NEW.id}`;

async function render(props: React.ComponentProps<typeof WhatsNewModal>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <WhatsNewModal {...props} />
      </SafeAreaProvider>,
    );
  });
  return renderer;
}

const isVisible = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findByType(Modal).props.visible;

const press = (r: ReactTestRenderer.ReactTestRenderer, testID: string) =>
  ReactTestRenderer.act(async () =>
    r.root.findByProps({testID}).props.onPress(),
  );

beforeEach(async () => {
  await AsyncStorage.removeItem(SEEN_KEY);
});

test('처음에는 보여주고, 확인하면 다음 실행부터 보여주지 않는다', async () => {
  const renderer = await render({enabled: true});
  expect(isVisible(renderer)).toBe(true);

  await press(renderer, 'whats-new-confirm-button');
  expect(isVisible(renderer)).toBe(false);

  const reopened = await render({enabled: true});
  expect(isVisible(reopened)).toBe(false);
});

test('뒤로 가기로 닫아도 본 것으로 기록한다', async () => {
  const renderer = await render({enabled: true});
  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(isVisible(renderer)).toBe(false);
  expect(await AsyncStorage.getItem(SEEN_KEY)).toBe('true');
});

test('다른 안내가 먼저 떠야 하면 미루고, 그동안 blocking을 알린다', async () => {
  const onBlockingChange = jest.fn();
  const renderer = await render({enabled: false, onBlockingChange});
  expect(isVisible(renderer)).toBe(false);
  expect(onBlockingChange).toHaveBeenLastCalledWith(true);
});

test('이미 본 id면 blocking도 풀린다', async () => {
  await AsyncStorage.setItem(SEEN_KEY, 'true');
  const onBlockingChange = jest.fn();
  const renderer = await render({enabled: true, onBlockingChange});
  expect(isVisible(renderer)).toBe(false);
  expect(onBlockingChange).toHaveBeenLastCalledWith(false);
});
