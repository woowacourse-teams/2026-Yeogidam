import React from 'react';
import {Image, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {StepPager} from '../src/components/StepPager';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));

const pages = ['첫 페이지', '마지막 페이지'].map(key => ({
  key,
  title: key,
  renderMedia: () => <Text>{key}</Text>,
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function finishTransition() {
  for (let index = 0; index < 6; index += 1) {
    await ReactTestRenderer.act(async () => {
      jest.runOnlyPendingTimers();
    });
  }
}

test('온보딩과 가이드의 공통 페이지에서 좌우 스와이프로 이동하고 경계를 지킨다', async () => {
  const onComplete = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StepPager flowName="onboarding" pages={pages} onComplete={onComplete} />,
    );
  });

  const content = renderer.root.find(node => !!node.props.onTouchStart);
  const title = () => renderer.root.find(
    node => node.props.testID?.startsWith('step-page-') && node.props.accessibilityElementsHidden === false,
  ).find(node => node.props.accessibilityRole === 'header').props.children;
  const swipe = async (dx: number, dy = 0) => {
    await ReactTestRenderer.act(async () => {
      content.props.onTouchStart({nativeEvent: {pageX: 200, pageY: 200, touches: [{}]}});
      content.props.onTouchMove({nativeEvent: {pageX: 200 + dx, pageY: 200 + dy}});
      content.props.onTouchEnd({nativeEvent: {pageX: 200 + dx, pageY: 200 + dy}});
    });
    await finishTransition();
  };

  await swipe(-20);
  await swipe(-100, 100);
  expect(title()).toBe('첫 페이지');

  await swipe(-100);
  expect(title()).toBe('마지막 페이지');
  await swipe(-100);
  expect(title()).toBe('마지막 페이지');
  expect(onComplete).not.toHaveBeenCalled();

  await swipe(100);
  expect(title()).toBe('첫 페이지');
  await swipe(100);
  expect(title()).toBe('첫 페이지');

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('두 번째 사용자 가이드에서 뒤로가면 첫 페이지로 돌아간다', async () => {
  const onComplete = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const render = (backRequest: number) => (
    <StepPager
      flowName="app_guide"
      pages={pages}
      onComplete={onComplete}
      onBackAtFirst={onComplete}
      backRequest={backRequest}
      showPrevious
    />
  );
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(render(0));
  });

  const title = () => renderer.root.find(
    node => node.props.testID?.startsWith('step-page-') && node.props.accessibilityElementsHidden === false,
  ).find(node => node.props.accessibilityRole === 'header').props.children;
  const next = renderer.root.find(node => node.props.accessibilityLabel === '다음');
  await ReactTestRenderer.act(async () => next.props.onPress());
  // 진입 모션 중의 뒤로가기도 첫 페이지로 돌아가야 한다.
  await ReactTestRenderer.act(async () => renderer.update(render(1)));
  await finishTransition();
  expect(title()).toBe('첫 페이지');

  const nextAgain = renderer.root.find(node => node.props.accessibilityLabel === '다음');
  await ReactTestRenderer.act(async () => nextAgain.props.onPress());
  await finishTransition();
  expect(title()).toBe('마지막 페이지');
  const previous = renderer.root.find(node => node.props.accessibilityLabel === '이전');
  await ReactTestRenderer.act(async () => previous.props.onPress());
  await finishTransition();
  expect(title()).toBe('첫 페이지');

  await ReactTestRenderer.act(async () => renderer.update(render(2)));
  expect(title()).toBe('첫 페이지');
  expect(onComplete).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('페이지를 왕복해도 각 페이지의 미디어를 다시 마운트하지 않는다', async () => {
  const mounts: Record<string, number> = {first: 0, second: 0};
  const unmounts: Record<string, number> = {first: 0, second: 0};
  function MediaProbe({id}: {id: string}) {
    React.useEffect(() => {
      mounts[id] += 1;
      return () => {
        unmounts[id] += 1;
      };
    }, [id]);
    return <Text>{id}</Text>;
  }
  const mediaPages = ['first', 'second'].map(id => ({
    key: id,
    title: id,
    renderMedia: () => <MediaProbe id={id} />,
  }));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StepPager flowName="app_guide" pages={mediaPages} onComplete={jest.fn()} showPrevious />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({testID: 'step-media-area'})[0].props.onLayout({
      nativeEvent: {layout: {height: 600}},
    });
  });
  expect(mounts).toEqual({first: 1, second: 1});

  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === '다음').props.onPress();
  });
  await finishTransition();
  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === '이전').props.onPress();
  });
  await finishTransition();

  expect(mounts).toEqual({first: 1, second: 1});
  expect(unmounts).toEqual({first: 0, second: 0});
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('GIF 페이지는 진입할 때마다 첫 프레임을 보여주고 새 미디어를 재생한다', async () => {
  const mounts: Record<string, number> = {first: 0, second: 0};
  function GifProbe({id, onLoad}: {id: string; onLoad?: () => void}) {
    React.useEffect(() => {
      mounts[id] += 1;
    }, [id]);
    return <Text onPress={onLoad}>{id}</Text>;
  }
  const gifPages = ['first', 'second'].map(id => ({
    key: id,
    title: id,
    posterSource: {uri: `poster-${id}`},
    renderMedia: (_frame: unknown, onLoad?: () => void) => (
      <GifProbe id={id} onLoad={onLoad} />
    ),
  }));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <StepPager flowName="app_guide" pages={gifPages} onComplete={jest.fn()} showPrevious />,
    );
  });
  await ReactTestRenderer.act(async () => {
    renderer.root.findAllByProps({testID: 'step-media-area'})[0].props.onLayout({
      nativeEvent: {layout: {height: 600}},
    });
  });
  expect(mounts).toEqual({first: 1, second: 0});
  expect(renderer.root.findAllByType(Image).map(node => node.props.source.uri)).toContain('poster-first');

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(GifProbe).props.onLoad();
  });
  expect(renderer.root.findAllByType(Image).map(node => node.props.source.uri)).not.toContain('poster-first');

  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === '다음').props.onPress();
  });
  await finishTransition();
  expect(mounts).toEqual({first: 1, second: 1});
  await ReactTestRenderer.act(async () => {
    renderer.root.find(node => node.props.accessibilityLabel === '이전').props.onPress();
  });
  await finishTransition();
  expect(mounts).toEqual({first: 2, second: 1});
  expect(renderer.root.findAllByType(Image).map(node => node.props.source.uri)).toContain('poster-first');
  await ReactTestRenderer.act(async () => renderer.unmount());
});
