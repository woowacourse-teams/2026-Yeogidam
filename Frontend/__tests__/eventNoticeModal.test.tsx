import React from 'react';
import {Linking, Modal} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EventNoticeModal,
  OPEN_EVENT_WINNER_NOTICE,
} from '../src/components/EventNoticeModal';

const DURING_EVENT = () => new Date('2026-11-05T12:00:00+09:00');

async function render(props: React.ComponentProps<typeof EventNoticeModal>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<EventNoticeModal {...props} />);
  });
  return renderer;
}

function isVisible(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(Modal).props.visible;
}

function pressButton(renderer: ReactTestRenderer.ReactTestRenderer, testID: string) {
  const button = renderer.root.findByProps({testID});
  return ReactTestRenderer.act(async () => button.props.onPress());
}

beforeEach(async () => {
  await AsyncStorage.removeItem(
    `@yeogidam/dismissed-event-notice/${OPEN_EVENT_WINNER_NOTICE.id}`,
  );
});

test('노출 기간 안에서만 이벤트 안내를 보여준다', async () => {
  const before = await render({
    enabled: true,
    now: () => new Date('2026-11-03T12:59:59+09:00'),
  });
  expect(isVisible(before)).toBe(false);

  const during = await render({enabled: true, now: DURING_EVENT});
  expect(isVisible(during)).toBe(true);

  const after = await render({
    enabled: true,
    now: () => new Date('2026-11-10T13:00:00+09:00'),
  });
  expect(isVisible(after)).toBe(false);
});

test('다른 모달이 떠 있는 동안에는 이벤트 안내를 미룬다', async () => {
  const renderer = await render({enabled: false, now: DURING_EVENT});
  expect(isVisible(renderer)).toBe(false);
});

test('한 번 닫으면 다시 실행해도 보여주지 않는다', async () => {
  const renderer = await render({enabled: true, now: DURING_EVENT});
  await pressButton(renderer, 'event-notice-dismiss-button');
  expect(isVisible(renderer)).toBe(false);

  const reopened = await render({enabled: true, now: DURING_EVENT});
  expect(isVisible(reopened)).toBe(false);
});

test('안드로이드 뒤로가기는 이번 실행에서만 숨기고 다음 실행에는 다시 보여준다', async () => {
  const renderer = await render({enabled: true, now: DURING_EVENT});
  await ReactTestRenderer.act(async () =>
    renderer.root.findByType(Modal).props.onRequestClose(),
  );
  expect(isVisible(renderer)).toBe(false);

  const reopened = await render({enabled: true, now: DURING_EVENT});
  expect(isVisible(reopened)).toBe(true);
});

test('인스타그램 버튼은 프로필을 열고 안내를 닫는다', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const renderer = await render({enabled: true, now: DURING_EVENT});

  await pressButton(renderer, 'event-notice-link-button');

  expect(openURL).toHaveBeenCalledWith('https://www.instagram.com/yeogidamm/');
  expect(isVisible(renderer)).toBe(false);
  openURL.mockRestore();
});
