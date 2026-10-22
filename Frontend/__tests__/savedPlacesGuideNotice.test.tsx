import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {SavedPlacesGuideNotice} from '../src/pages/saved-places/components/SavedPlacesGuideNotice';

test('저장 방법 안내 카드는 아이콘과 문구를 중앙에 두고 오른쪽 끝에 화살표를 표시한다', async () => {
  const onOpenGuide = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPlacesGuideNotice topOffset={74} onOpenGuide={onOpenGuide} />,
    );
  });

  const overlay = renderer.root.findByProps({testID: 'saved-places-guide-overlay'});
  expect(overlay.props.style[0].position).toBe('absolute');
  expect(overlay.props.style[1].top).toBe(74);

  const card = renderer.root.findByProps({testID: 'saved-places-guide-card'});
  const cardStyle = card.props.style({pressed: false})[0];
  expect(cardStyle.height).toBe(48);
  expect(card.props.accessibilityLabel).toBe('저장 방법 알아보기');
  await ReactTestRenderer.act(async () => card.props.onPress());
  expect(onOpenGuide).toHaveBeenCalledTimes(1);

  expect(renderer.root.findAllByProps({accessibilityLabel: '저장 방법 안내 숨기기'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({testID: 'saved-places-guide-toast'})).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toContain('저장 방법 알아보기');
  await ReactTestRenderer.act(async () => renderer.unmount());
});
