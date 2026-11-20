import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sleep } from './support/browser.mjs';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const WIDTHS = [1440, 1024, 820, 390];

describe('레이아웃', { concurrency: true }, () => {
  for (const width of WIDTHS) {
    test(`${width}px 너비에서 가로 스크롤과 콘솔 오류가 없고 폰 데모가 칸에 맞게 줄어든다`, async (t) => {
      const page = await landing.open(t, '/', { width, height: width < 600 ? 844 : 900 });
      await sleep(300);
      const { scrollWidth, innerWidth, scale } = await page.eval(`({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        scale: parseFloat(getComputedStyle(document.getElementById('phone')).getPropertyValue('--s')),
      })`);
      const overflow = scrollWidth - innerWidth;
      assert.ok(overflow <= 0, `가로로 ${overflow}px 넘친다`);
      assert.ok(scale > 0 && scale <= 1, `폰 비율 ${scale}`);
      assert.deepEqual(page.problems, []);
    });
  }

  test('휴대폰 너비에서는 품질 섹션 버전 번호 아래 날짜를 숨긴다', async (t) => {
    const narrow = await landing.open(t, '/', { width: 390, height: 844 });
    assert.equal(await narrow.isVisible('#jr-t-20 .jr-tdate'), false);
    const wide = await landing.open(t, '/', { width: 1280, height: 900 });
    assert.equal(await wide.isVisible('#jr-t-20 .jr-tdate'), true);
  });

  test('페이지 안 링크는 모두 있는 섹션을 가리킨다', async (t) => {
    const page = await landing.open(t);
    const missing = await page.eval(`[...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute('href').slice(1))
      .filter((id) => id && !document.getElementById(id))`);
    assert.deepEqual(missing, []);
  });

  test('내 컴퓨터 주소(127.0.0.1)에서 열면 GA 전송을 끄고, 이벤트는 dataLayer에만 쌓는다', async (t) => {
    const page = await landing.open(t);
    assert.equal(await page.eval(`window['ga-disable-G-V0G6SC57DV']`), true);
    assert.ok((await page.eval('window.dataLayer.length')) > 0);
  });
});

describe('스크립트가 돌기 전 첫 화면', { concurrency: true }, () => {
  for (const [width, height] of [[1280, 900], [1280, 700], [390, 844]]) {
    test(`${width}x${height}에서 스크립트 전에도 릴스 사진이 보이고, 스크립트가 돈 뒤에도 폰 칸 크기가 그대로다`, async (t) => {
      const before = await landing.open(t, '/', { width, height, javaScript: false });
      await before.waitFor(`document.querySelector('#reelBg img.fit')?.naturalWidth > 0`, { what: '릴스 사진을 받는다' });
      assert.equal(await before.isVisible('#reelBg img.fit'), true);
      const size = `(() => { const r = document.getElementById('phoneWrap').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`;
      const after = await landing.open(t, '/', { width, height });
      await after.waitForVisible('#chips .chip');
      assert.deepEqual(await before.eval(size), await after.eval(size));
    });
  }
});
