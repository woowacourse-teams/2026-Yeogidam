import React from 'react';
import {View} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {SavedPlacesEmptyState} from '../src/pages/saved-places/components/SavedPlacesEmptyState';

test('비회원 빈 보관함은 로그인 버튼을 제공한다', async () => {
  const onLogin = jest.fn();
  const onOpenGuide = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesEmptyState
        isGuest
        onLogin={onLogin}
        onOpenGuide={onOpenGuide}
      />,
    );
  });

  const loginButton = renderer.root.findByProps({
    accessibilityLabel: '보관함 로그인',
  });
  const emptyContent = renderer.root.findAllByType(View)[0];
  expect(emptyContent.props.style.transform).toEqual([{translateY: -20}]);
  await ReactTestRenderer.act(async () => loginButton.props.onPress());
  expect(onLogin).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () =>
    loginButton.props.onLayout({
      nativeEvent: {layout: {y: 250, height: 48}},
    }),
  );
  const guide = renderer.root.findByProps({
    testID: 'saved-places-guide-overlay',
  });
  expect(guide.props.style[1].top).toBe(310);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('회원 빈 보관함에는 로그인 버튼을 표시하지 않는다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesEmptyState onOpenGuide={jest.fn()} />,
    );
  });

  expect(
    renderer.root.findAllByProps({accessibilityLabel: '보관함 로그인'}),
  ).toHaveLength(0);

  const description = renderer.root.findByProps({
    testID: 'saved-places-empty-description',
  });
  await ReactTestRenderer.act(async () =>
    description.props.onLayout({
      nativeEvent: {layout: {y: 200, height: 45}},
    }),
  );
  const guide = renderer.root.findByProps({
    testID: 'saved-places-guide-overlay',
  });
  expect(guide.props.style[1].top).toBe(269);

  await ReactTestRenderer.act(async () => renderer.unmount());
});
