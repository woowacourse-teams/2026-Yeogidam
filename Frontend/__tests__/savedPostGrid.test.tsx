import React from 'react';
import {Image, StyleSheet, useWindowDimensions} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {HistoryReel} from '../src/entities/content/types';
import {SavedPostGrid} from '../src/pages/saved-places/components/SavedPostGrid';

jest.mock('react-native-linear-gradient', () => 'LinearGradient');

const reel = {
  id: '81',
  instagram_url: 'https://www.instagram.com/reel/abc/',
  instagram_description: '성수 카페 투어',
  instagram_thumbnail_url: null,
  created_at: '2026-11-04T00:00:00Z',
} as HistoryReel;

async function renderGrid(props: Partial<React.ComponentProps<typeof SavedPostGrid>>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SavedPostGrid onPressReel={jest.fn()} reels={[reel]} {...props} />,
    );
  });
  return renderer.root.findAll(
    node => typeof node.props.onLongPress === 'function',
  )[0];
}

describe('게시물 사진 비율', () => {
  function WidthProbe({onWidth}: {onWidth: (width: number) => void}) {
    onWidth(useWindowDimensions().width);
    return null;
  }

  async function columnWidth() {
    let width = 0;
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<WidthProbe onWidth={value => (width = value)} />);
    });
    return (width - 20 * 2 - 16) / 2;
  }

  const imageHeight = (card: ReactTestRenderer.ReactTestInstance) =>
    card.findAll(
      node =>
        typeof node.type === 'string' &&
        StyleSheet.flatten(node.props.style)?.borderRadius === 14,
    )[0].props.style;

  test.each([
    ['릴스는 세로 상한까지만 늘어난다', 1920, 1.4],
    ['캐러셀은 실제 비율로 보여 준다', 1350, 1.25],
    ['정사각형은 실제 비율로 보여 준다', 1080, 1],
  ])('%s', async (_, height, ratio) => {
    const width = await columnWidth();
    const card = await renderGrid({
      reels: [{...reel, instagram_thumbnail_url: 'https://cdn.example.com/81.jpg'}],
    });

    await ReactTestRenderer.act(async () => {
      card.findByType(Image).props.onLoad({
        nativeEvent: {source: {width: 1080, height}},
      });
    });

    expect(StyleSheet.flatten(imageHeight(card)).height).toBeCloseTo(width * ratio);
  });
});

test('게시물을 길게 누르면 편집을 시작하고, 손을 뗄 때 상세로 넘어가지 않는다', async () => {
  const onLongPressReel = jest.fn();
  const onPressReel = jest.fn();
  const card = await renderGrid({onLongPressReel, onPressReel});

  ReactTestRenderer.act(() => {
    card.props.onPressIn();
    card.props.onLongPress();
    card.props.onPress();
  });

  expect(onLongPressReel).toHaveBeenCalledTimes(1);
  expect(onPressReel).not.toHaveBeenCalled();
});

test('짧게 누르면 상세로 넘어간다', async () => {
  const onPressReel = jest.fn();
  const card = await renderGrid({onLongPressReel: jest.fn(), onPressReel});

  ReactTestRenderer.act(() => {
    card.props.onPressIn();
    card.props.onPress();
  });

  expect(onPressReel).toHaveBeenCalledWith(reel);
});

test('편집 중에는 길게 눌러도 다시 편집을 시작하지 않고, 누르면 선택을 바꾼다', async () => {
  const onLongPressReel = jest.fn();
  const onToggleReelSelection = jest.fn();
  const card = await renderGrid({isEditing: true, onLongPressReel, onToggleReelSelection});

  ReactTestRenderer.act(() => {
    card.props.onPressIn();
    card.props.onLongPress();
    card.props.onPress();
  });

  expect(onLongPressReel).not.toHaveBeenCalled();
  expect(onToggleReelSelection).toHaveBeenCalledWith('81');
});
