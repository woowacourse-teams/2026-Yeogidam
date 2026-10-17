import type React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// 테스트가 그린 렌더러를 기록해 두었다가 테스트마다 끝에 한 곳에서 내리는 도우미와, 끝난 요청이 만든 갱신을 모두 반영할 때까지 기다리는 도우미입니다.
// 내리기는 jest.config.js의 setupFilesAfterEnv(support/unmountTrackedAfterEach.ts)가 모든 테스트 파일에 걸어 두므로,
// 테스트 파일은 렌더러를 내리는 afterEach를 따로 두지 않습니다. 이 도우미로 그리지 않은 렌더러는 건드리지 않습니다.

export type Renderer = ReactTestRenderer.ReactTestRenderer;

const act = ReactTestRenderer.act;
const tracked: Renderer[] = [];

/** act 안에서 그리고, 테스트가 끝나면 내리도록 기록합니다. 단언이 중간에 실패해도 다음 테스트로 넘어가지 않습니다. */
export async function renderTracked(
  element: React.ReactElement,
  options?: ReactTestRenderer.TestRendererOptions,
): Promise<Renderer> {
  let renderer!: Renderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(element, options);
  });
  tracked.push(renderer);
  return renderer;
}

/** 테스트 도중에 내립니다. 앱을 다시 켜는 순서처럼 내리는 일 자체가 시나리오일 때 씁니다. */
export async function unmountTracked(renderer: Renderer): Promise<void> {
  const index = tracked.indexOf(renderer);
  if (index >= 0) tracked.splice(index, 1);
  await act(async () => renderer.unmount());
}

/** 기록한 렌더러를 모두 내립니다. setupFilesAfterEnv가 테스트마다 끝에 부릅니다. */
export async function unmountAllTracked(): Promise<void> {
  for (const renderer of tracked.splice(0)) {
    await act(async () => renderer.unmount());
  }
}

/**
 * 이미 끝난 요청에 이어지는 then 사슬과, then 사슬이 만든 상태 갱신과 effect를 모두 반영할 때까지 기다립니다.
 * React 19.2.3의 async act는 콜백이 끝난 뒤 timers 모듈의 setImmediate(가짜 타이머가 바꾸지 않는 진짜 매크로태스크)를 거쳐
 * act 큐가 빌 때까지 다시 비우고, setImmediate가 돌기 전에 마이크로태스크가 모두 돌므로 then 사슬의 길이와 상관없이 같은 결과가 됩니다.
 * 가짜 타이머는 움직이지 않고 아직 끝나지 않은 요청(deferred)은 기다리지 않으며, then 사슬 도중의 중간 상태는 볼 수 없습니다.
 */
export function settleAsyncWork(): Promise<void> {
  return act(async () => undefined);
}
