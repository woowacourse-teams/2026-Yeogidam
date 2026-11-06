import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Platform } from 'react-native';

import { AppAlertHost } from '../src/components/AppAlertHost';
import { AppModal } from '../src/components/AppModal';
import { getCurrentAppAlert, showAlert } from '../src/lib/app-alert';

test('iOS 확인창은 바깥쪽 터치로 취소하고 확인은 직접 눌렀을 때만 실행한다', async () => {
  expect(Platform.OS).toBe('ios');
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AppAlertHost />);
  });

  await ReactTestRenderer.act(async () => {
    showAlert('삭제할까요?', '선택한 장소가 삭제됩니다.', [
      { text: '취소', style: 'cancel', onPress: onCancel },
      { text: '삭제', style: 'destructive', onPress: onConfirm },
    ]);
  });
  const modal = renderer.root.findByType(AppModal);
  expect(modal.props.visible).toBe(true);
  await ReactTestRenderer.act(async () => {
    modal.props.children.props.children[0].props.onPress();
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(getCurrentAppAlert()).toBeNull();

  await ReactTestRenderer.act(async () => {
    showAlert('삭제할까요?', '', [
      { text: '취소', style: 'cancel', onPress: onCancel },
      { text: '삭제', style: 'destructive', onPress: onConfirm },
    ]);
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(AppModal).props.children.props.children[1].props.children[2].props.children[1].props.onPress();
  });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(getCurrentAppAlert()).toBeNull();
  await ReactTestRenderer.act(async () => renderer.unmount());
});
