import ReactTestRenderer from 'react-test-renderer';

import {settleAsyncWork, type Renderer} from './renderers';

/**
 * 접근성 레이블이 같은 첫 번째 누를 수 있는 요소를 누르고, 이어지는 갱신을 기다립니다.
 * disabled는 보지 않고 onPress를 바로 부르므로, 막힌 버튼을 눌러 화면 안의 겹침 가드를 볼 때도 씁니다.
 */
export async function pressLabel(renderer: Renderer, label: string) {
  const [target] = renderer.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  await ReactTestRenderer.act(async () => {
    target.props.onPress();
  });
  await settleAsyncWork();
}
