import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Modal, Text} from 'react-native';

import {AppUpdateModal} from '../src/components/AppUpdateModal';
import {renderTracked, type Renderer} from './support/renderers';

// 모달에 그린 버튼을 위에서부터 찾습니다. 그린 Pressable의 type은 memo로 감싼 Pressable이 아니라 안쪽 함수라
// findAllByType(Pressable)로는 찾지 못하므로 onPress로 찾습니다. 어떤 버튼이 보이는지는 버튼 글자로 단언합니다.
const findButtons = (renderer: Renderer) =>
  renderer.root.findByType(Modal).findAll(node => typeof node.props.onPress === 'function');
const labelsOf = (buttons: ReactTestRenderer.ReactTestInstance[]) =>
  buttons.map(button => button.findByType(Text).props.children);

test('권장 업데이트는 나중에 버튼과 뒤로 가기로 닫을 수 있다', async () => {
  const onDismiss = jest.fn();
  const renderer = await renderTracked(
    <AppUpdateModal
      mode="recommended"
      storeUrl="https://example.com/store"
      visible
      onDismiss={onDismiss}
    />,
  );

  const buttons = findButtons(renderer);
  expect(labelsOf(buttons)).toEqual(['지금 업데이트', '나중에']);
  await ReactTestRenderer.act(async () => buttons[1].props.onPress());
  expect(onDismiss).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

test('필수 업데이트는 닫기 버튼이 없고 뒤로 가기로 닫히지 않는다', async () => {
  const renderer = await renderTracked(
    <AppUpdateModal
      mode="required"
      storeUrl="https://example.com/store"
      visible
    />,
  );

  expect(labelsOf(findButtons(renderer))).toEqual(['지금 업데이트']);
  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
});
