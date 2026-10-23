import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Modal, Pressable} from 'react-native';

import {AppUpdateModal} from '../src/components/AppUpdateModal';

function findPressables(
  node: React.ReactNode,
): React.ReactElement<{onPress: () => void}>[] {
  if (!React.isValidElement<{children?: React.ReactNode}>(node)) return [];

  const current =
    node.type === Pressable
      ? [node as React.ReactElement<{onPress: () => void}>]
      : [];
  return [
    ...current,
    ...React.Children.toArray(node.props.children).flatMap(findPressables),
  ];
}

test('권장 업데이트는 나중에 버튼과 뒤로 가기로 닫을 수 있다', async () => {
  const onDismiss = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AppUpdateModal
        mode="recommended"
        storeUrl="https://example.com/store"
        visible
        onDismiss={onDismiss}
      />,
    );
  });

  const buttons = findPressables(renderer.root.findByType(Modal).props.children);
  expect(buttons).toHaveLength(2);
  await ReactTestRenderer.act(async () => buttons[1].props.onPress());
  expect(onDismiss).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(onDismiss).toHaveBeenCalledTimes(2);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('필수 업데이트는 닫기 버튼이 없고 뒤로 가기로 닫히지 않는다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AppUpdateModal
        mode="required"
        storeUrl="https://example.com/store"
        visible
      />,
    );
  });

  expect(findPressables(renderer.root.findByType(Modal).props.children)).toHaveLength(1);
  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
