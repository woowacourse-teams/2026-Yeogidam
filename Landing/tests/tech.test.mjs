import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sleep } from './support/browser.mjs';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const foundState = (page) => page.eval(`document.getElementById('techStage').getAttribute('data-found')`);

describe('기술 섹션', { concurrency: true }, () => {
  test('섹션이 보이면 tech_view를 한 번 남기고, 캡션과 자막과 컵 글자를 읽은 뒤 카카오 지도 결과를 띄운다', async (t) => {
    const page = await landing.open(t);
    assert.equal(await foundState(page), 'done');
    assert.deepEqual(await page.events('tech_view'), []);

    await page.eval(`document.getElementById('techStage').scrollIntoView({ block: 'center' })`);
    await page.waitFor(`!document.getElementById('techStage').hasAttribute('data-found')`, { what: '처음 장면으로 돌아간다' });
    await page.waitForText('#techStage .tx-txt', '캡션 읽는 중');
    await page.waitFor(`document.getElementById('techStage').getAttribute('data-found') === 'load'`, { timeout: 12000, what: '카카오 지도에서 확인한다' });
    await page.waitFor(`document.getElementById('techStage').getAttribute('data-found') === 'done'`, { timeout: 5000, what: '찾은 결과를 띄운다' });
    await page.waitForText('#techStage .tx-txt', '1곳을 찾았어요');

    await page.eval(`window.scrollTo(0, 0)`);
    await sleep(300);
    await page.eval(`document.getElementById('techStage').scrollIntoView({ block: 'center' })`);
    await sleep(300);
    assert.deepEqual(await page.events('tech_view'), [{ name: 'tech_view', params: null }]);
    assert.deepEqual(page.problems, []);
  });

  test('움직임 줄이기 설정이면 장면을 넘기지 않고 찾은 결과에 멈춰 있다', async (t) => {
    const page = await landing.open(t, '/', { reducedMotion: true });
    await page.eval(`document.getElementById('techStage').scrollIntoView({ block: 'center' })`);
    await page.waitFor(`window.dataLayer.some((entry) => entry[1] === 'tech_view')`, { what: 'tech_view를 보낸다' });
    await sleep(3000);
    assert.equal(await foundState(page), 'done');
    assert.equal(await page.text('#techStage .tx-txt'), '1곳을 찾았어요');
  });

  test('측정 방법을 처음 펼칠 때만 tech_method_open을 남긴다', async (t) => {
    const page = await landing.open(t);
    await page.click('.tx-how summary');
    await page.waitFor(`document.querySelector('.tx-how').open`, { what: '측정 방법이 펼쳐진다' });
    await page.click('.tx-how summary');
    await page.click('.tx-how summary');
    await sleep(200);
    assert.deepEqual(await page.events('tech_method_open'), [{ name: 'tech_method_open', params: null }]);
  });
});
