import React from 'react';
import {Linking} from 'react-native';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';
import ReactTestRenderer from 'react-test-renderer';

import {PlaceBlogList} from '../src/pages/place-detail/components/PlaceBlogList';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-inappbrowser-reborn', () => ({
  InAppBrowser: {
    isAvailable: jest.fn(),
    open: jest.fn(),
  },
}));

const LINK = 'https://blog.naver.com/a/1';
const posts = [
  {id: LINK, title: '첫 글', meta: '네이버 · 산책 · 3일 전', link: LINK, isNaver: true},
];

async function pressPost() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<PlaceBlogList posts={posts} />);
  });
  const press = () =>
    ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({accessibilityLabel: '첫 글 블로그 글 열기'})
        .props.onPress();
    });
  await press();
  return press;
}

describe('블로그 글 열기', () => {
  beforeEach(() => {
    jest.mocked(InAppBrowser.isAvailable).mockReset().mockResolvedValue(true);
    jest.mocked(InAppBrowser.open).mockReset().mockResolvedValue({type: 'cancel'});
    jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined);
  });

  test('인앱 브라우저로 열고 외부 브라우저는 열지 않는다', async () => {
    await pressPost();

    expect(InAppBrowser.open).toHaveBeenCalledWith(
      LINK,
      expect.objectContaining({animated: true, modalEnabled: true}),
    );
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('인앱 브라우저를 쓸 수 없으면 외부 브라우저로 연다', async () => {
    jest.mocked(InAppBrowser.isAvailable).mockResolvedValue(false);

    await pressPost();

    expect(InAppBrowser.open).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(LINK);
  });

  test('인앱 브라우저를 띄우지 못하면 외부 브라우저로 연다', async () => {
    jest.mocked(InAppBrowser.open).mockRejectedValue(new Error('failed'));

    await pressPost();

    expect(Linking.openURL).toHaveBeenCalledWith(LINK);
  });

  test('브라우저가 열려 있는 동안 다시 눌러도 한 번만 연다', async () => {
    jest.mocked(InAppBrowser.open).mockReturnValue(new Promise(() => undefined));

    const press = await pressPost();
    await press();

    expect(InAppBrowser.open).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
