import type React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// 테스트가 그린 렌더러를 기록해 두었다가 테스트마다 끝에 한 곳에서 내리는 도우미와, 그린 뒤의 갱신을 기다리는 도우미입니다.
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

/** 마이크로태스크를 다섯 번 비워, 요청이 끝난 뒤 이어지는 then과 상태 갱신까지 반영합니다. */
export async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

/** act를 한 번 기다려, 이미 끝난 요청의 상태 갱신과 그 뒤의 effect만 반영합니다. */
export function flushEffects(): Promise<void> {
  return act(async () => undefined);
}
