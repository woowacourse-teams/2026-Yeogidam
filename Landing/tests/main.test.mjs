import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

// 폰 데모 자리를 문서에 들어오자마자 지워서 initDemo가 실패하게 만든다
const BREAK_DEMO = `new MutationObserver(() => document.getElementById('phoneWrap')?.remove())
  .observe(document, { childList: true, subtree: true });`;

test('데모를 붙이다 실패해도 스토어 링크, store_click, 품질 섹션은 붙고 실패는 콘솔에 하나만 남는다', async (t) => {
  const page = await landing.open(t, '/?utm_source=iso&utm_medium=test', { initScript: BREAK_DEMO });
  await page.waitFor(`document.querySelectorAll('#jr-p-11 .jr-dots i').length === 19`, { what: '품질 섹션 점이 그려진다' });

  assert.ok((await page.eval(`document.querySelector('.hero a.play').href`)).includes('utm_source%3Diso%26utm_medium%3Dtest'));
  await page.click('.hero .badges a.ios');
  assert.deepEqual((await page.events('store_click')).map((event) => event.params), [
    { store: 'app_store', placement: 'hero', demo_progress: 'none' },
  ]);
  assert.equal(page.problems.length, 1);
  assert.match(page.problems[0], /랜딩 데모 붙이기에 실패했다/);
});
