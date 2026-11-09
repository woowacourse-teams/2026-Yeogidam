import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

test('자동으로 보기를 누르면 손대지 않아도 끝 카드까지 가고, 단계마다 auto로 GA에 남는다', async (t) => {
  const page = await landing.open(t);
  await page.waitForVisible('#scrReel');

  await page.click('#btnAuto');
  assert.equal(await page.text('#btnAuto'), '자동 재생 멈추기');
  await page.waitForVisible('#endcard', { timeout: 45000 });

  assert.equal(await page.text('#btnAuto'), '자동으로 보기');
  assert.deepEqual((await page.events('demo_step')).map((event) => event.params),
    ['share', 'send', 'open_app', 'result', 'library', 'map', 'detail', 'end'].map((step) => ({ step, mode: 'auto' })));
  assert.deepEqual(page.problems, []);
});
