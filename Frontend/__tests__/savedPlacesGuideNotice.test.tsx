import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer from 'react-test-renderer';

import {SavedPlacesGuideNotice} from '../src/pages/saved-places/components/SavedPlacesGuideNotice';

const DISMISSED_KEY = 'saved-places-guide-dismissed-v1';

test('가이드를 열고 X를 누르면 다시 보는 방법만 토스트로 표시한다', async () => {
  await AsyncStorage.removeItem(DISMISSED_KEY);
  const onOpenGuide = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesGuideNotice topOffset={74} onOpenGuide={onOpenGuide} />,
    );
    await Promise.resolve();
  });

  const floating = renderer.root.findByProps({
    testID: 'saved-places-guide-overlay',
  });
  expect(floating.props.style[0].position).toBe('absolute');
  expect(floating.props.style[1].top).toBe(74);
  expect(
    renderer.root.findByProps({testID: 'saved-places-guide-card'}).props.style.height,
  ).toBe(48);

  const openButton = renderer.root.findByProps({
    accessibilityLabel: '저장 방법 알아보기',
  });
  await ReactTestRenderer.act(async () => openButton.props.onPress());
  expect(onOpenGuide).toHaveBeenCalledTimes(1);

  const dismissButton = renderer.root.findByProps({
    accessibilityLabel: '저장 방법 안내 숨기기',
  });
  await ReactTestRenderer.act(async () => dismissButton.props.onPress());

  expect(renderer.root.findAllByProps({accessibilityLabel: '저장 방법 알아보기'})).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).not.toContain('저장 방법 안내를 숨겼어요');
  expect(JSON.stringify(renderer.toJSON())).toContain('내 정보 > 사용 가이드');
  const toast = renderer.root.findByProps({
    testID: 'saved-places-guide-toast',
  });
  expect(toast.props.style[0].height).toBe(48);
  expect(toast.props.style[0].borderRadius).toBe(14);
  expect(toast.props.style[0].paddingLeft).toBe(20);
  expect(
    renderer.root.findByProps({testID: 'saved-places-guide-overlay'}).props.style[0]
      .position,
  ).toBe('absolute');
  await expect(AsyncStorage.getItem(DISMISSED_KEY)).resolves.toBe('true');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('닫은 가이드는 화면을 다시 만들어도 숨김 상태를 유지한다', async () => {
  await AsyncStorage.setItem(DISMISSED_KEY, 'true');
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesGuideNotice topOffset={74} onOpenGuide={jest.fn()} />,
    );
    await Promise.resolve();
  });

  expect(renderer.root.findAllByProps({testID: 'saved-places-guide-card'})).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
