import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useGuestLoginPrompt} from '../src/app/useGuestLoginPrompt';
import {renderTracked} from './support/renderers';

type Props = {isGuestBrowsing: boolean; isMember: boolean};
let latest: ReturnType<typeof useGuestLoginPrompt>;

function Harness(props: Props) {
  latest = useGuestLoginPrompt(props);
  return null;
}

const act = ReactTestRenderer.act;

async function render(props: Props) {
  const renderer = await renderTracked(<Harness {...props} />);
  return (next: Props) => act(async () => renderer.update(<Harness {...next} />));
}

test('로그인이 필요한 동작을 시도하면 띄우고, 닫으면 내리며, 다시 시도하면 다시 띄운다', async () => {
  await render({isGuestBrowsing: true, isMember: false});
  expect(latest.isGuestLoginPromptVisible).toBe(false);

  await act(async () => latest.showGuestLoginPrompt());
  expect(latest.isGuestLoginPromptVisible).toBe(true);

  await act(async () => latest.dismissGuestLoginPrompt());
  expect(latest.isGuestLoginPromptVisible).toBe(false);

  await act(async () => latest.showGuestLoginPrompt());
  expect(latest.isGuestLoginPromptVisible).toBe(true);
});

test('비회원 메인을 방해 없이 보고 있지 않으면 요청이 남아 있어도 숨기고, 다시 보면 띄운다', async () => {
  const rerender = await render({isGuestBrowsing: true, isMember: false});
  await act(async () => latest.showGuestLoginPrompt());

  await rerender({isGuestBrowsing: false, isMember: false});
  expect(latest.isGuestLoginPromptVisible).toBe(false);

  await rerender({isGuestBrowsing: true, isMember: false});
  expect(latest.isGuestLoginPromptVisible).toBe(true);
});

test('회원이 되면 남은 요청을 지워 로그아웃 뒤 다시 둘러봐도 띄우지 않는다', async () => {
  const rerender = await render({isGuestBrowsing: true, isMember: false});
  await act(async () => latest.showGuestLoginPrompt());

  await rerender({isGuestBrowsing: false, isMember: true});
  await rerender({isGuestBrowsing: true, isMember: false});

  expect(latest.isGuestLoginPromptVisible).toBe(false);
});

test('띄우기와 닫기 함수는 다시 그려도 같은 참조다', async () => {
  const rerender = await render({isGuestBrowsing: true, isMember: false});
  const {showGuestLoginPrompt, dismissGuestLoginPrompt} = latest;

  await rerender({isGuestBrowsing: false, isMember: false});

  expect(latest.showGuestLoginPrompt).toBe(showGuestLoginPrompt);
  expect(latest.dismissGuestLoginPrompt).toBe(dismissGuestLoginPrompt);
});
