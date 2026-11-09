import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sleep } from './support/browser.mjs';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const selectedVersion = (page) => page.eval(`document.querySelector('.jr-tab[aria-selected="true"]')?.dataset.v ?? null`);
const shownPanels = (page) => page.eval(`[...document.querySelectorAll('.jr-panel.on')].map((panel) => panel.id)`);

describe('품질 섹션', { concurrency: true }, () => {
  test('처음에는 2.0을 보여 주고, 섹션이 보이면 journey_view를 한 번 남긴다', async (t) => {
    const page = await landing.open(t);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('.jr-tab')].map((tab) => tab.dataset.v)`), ['1.0', '1.1', '2.0', '2.1', '2.2', '2.3', '다음']);
    assert.equal(await selectedVersion(page), '2.0');
    assert.deepEqual(await shownPanels(page), ['jr-p-20']);
    assert.deepEqual(await page.events('journey_view'), []);

    await page.eval(`document.getElementById('journey').scrollIntoView({ block: 'center' })`);
    await page.waitFor(`window.dataLayer.some((entry) => entry[1] === 'journey_view')`, { what: 'journey_view를 보낸다' });
    await page.eval(`window.scrollTo(0, 0)`);
    await sleep(200);
    await page.eval(`document.getElementById('journey').scrollIntoView({ block: 'center' })`);
    await sleep(300);
    assert.equal((await page.events('journey_view')).length, 1);
    assert.deepEqual(page.problems, []);
  });

  test('버전 번호에 마우스를 0.5초 넘게 올리면 해당 버전을 열고, journey_version_open은 페이지마다 한 번만 남긴다', async (t) => {
    const page = await landing.open(t);
    await page.hover('#jr-t-21');
    assert.equal(await selectedVersion(page), '2.1');
    assert.deepEqual(await shownPanels(page), ['jr-p-21']);
    await page.waitFor(`window.dataLayer.some((entry) => entry[1] === 'journey_version_open')`, { what: 'journey_version_open을 보낸다' });

    await page.click('#jr-t-11');
    assert.equal(await selectedVersion(page), '1.1');
    assert.deepEqual(await shownPanels(page), ['jr-p-11']);
    await sleep(700);
    assert.deepEqual(await page.events('journey_version_open'), [{ name: 'journey_version_open', params: { version: '2.1' } }]);
    assert.deepEqual(page.problems, []);
  });

  test('누른 버전으로 바로 열고, 키보드는 왼쪽과 오른쪽 화살표로 버전을 옮기며 끝에서 반대쪽 끝으로 넘어간다', async (t) => {
    const page = await landing.open(t);
    await page.click('#jr-t-22');
    assert.equal(await selectedVersion(page), '2.2');
    assert.deepEqual(await page.events('journey_version_open'), [{ name: 'journey_version_open', params: { version: '2.2' } }]);

    await page.eval(`document.getElementById('jr-t-10').focus()`);
    await page.press('ArrowLeft');
    assert.equal(await selectedVersion(page), '다음');
    assert.equal(await page.eval(`document.activeElement.id`), 'jr-t-next');
    await page.press('ArrowRight');
    assert.equal(await selectedVersion(page), '1.0');
    assert.equal(await page.eval(`document.activeElement.id`), 'jr-t-10');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('.jr-tab')].map((tab) => [tab.id, tab.tabIndex])`),
      [['jr-t-10', 0], ['jr-t-11', -1], ['jr-t-20', -1], ['jr-t-21', -1], ['jr-t-22', -1], ['jr-t-23', -1], ['jr-t-next', -1]]);
    assert.deepEqual(page.problems, []);
  });

  test('버전마다 참여한 사람 수만큼 점을 그리고 기준을 넘은 사람만 채운다', async (t) => {
    const page = await landing.open(t);
    const dots = await page.eval(`[...document.querySelectorAll('.jr-panel')].map((panel) => [
      panel.id,
      [...panel.querySelectorAll('.jr-dots')].map((row) => ({
        cols: row.style.getPropertyValue('--cols'),
        total: row.querySelectorAll('i').length,
        filled: row.querySelectorAll('i.on').length,
      })),
    ])`);
    assert.deepEqual(dots, [
      ['jr-p-10', []],
      ['jr-p-11', [{ cols: '10', total: 19, filled: 1 }]],
      ['jr-p-20', [{ cols: '5', total: 5, filled: 2 }, { cols: '5', total: 5, filled: 4 }]],
      ['jr-p-21', [{ cols: '5', total: 5, filled: 5 }]],
      ['jr-p-22', [{ cols: '4', total: 4, filled: 3 }]],
      ['jr-p-23', [{ cols: '5', total: 5, filled: 4 }]],
      ['jr-p-next', []],
    ]);
  });
});
