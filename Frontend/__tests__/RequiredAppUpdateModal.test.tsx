import React from 'react';
import { Modal, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { RequiredAppUpdateModal } from '../src/components/RequiredAppUpdateModal';

function render(variant: 'required' | 'recommended', onClose: () => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <RequiredAppUpdateModal
        onClose={onClose}
        storeUrl="https://apps.apple.com/kr/app/id0000000000"
        variant={variant}
        visible
      />,
    );
  });
  return renderer;
}

function findButtonByLabel(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
) {
  return renderer.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.findAllByType(Text).some(text => text.props.children === label),
  );
}

describe('RequiredAppUpdateModal', () => {
  it('closes the recommended variant from the later button and the back button', () => {
    const onClose = jest.fn();
    const renderer = render('recommended', onClose);

    const [laterButton] = findButtonByLabel(renderer, '나중에');
    ReactTestRenderer.act(() => laterButton.props.onPress());
    renderer.root.findByType(Modal).props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not let the required variant close', () => {
    const onClose = jest.fn();
    const renderer = render('required', onClose);

    expect(findButtonByLabel(renderer, '나중에')).toHaveLength(0);
    renderer.root.findByType(Modal).props.onRequestClose();

    expect(onClose).not.toHaveBeenCalled();
  });
});
