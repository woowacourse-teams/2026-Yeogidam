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
});
