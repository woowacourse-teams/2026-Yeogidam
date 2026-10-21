import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {SavedPlacesEmptyState} from '../src/pages/saved-places/components/SavedPlacesEmptyState';

test('비회원 빈 보관함은 로그인 버튼을 제공한다', async () => {
  const onLogin = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesEmptyState isGuest onLogin={onLogin} />,
    );
  });

  const loginButton = renderer.root.findByProps({
    accessibilityLabel: '보관함 로그인',
  });
  await ReactTestRenderer.act(async () => loginButton.props.onPress());
  expect(onLogin).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('회원 빈 보관함에는 로그인 버튼을 표시하지 않는다', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<SavedPlacesEmptyState />);
  });

  expect(
    renderer.root.findAllByProps({accessibilityLabel: '보관함 로그인'}),
  ).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
