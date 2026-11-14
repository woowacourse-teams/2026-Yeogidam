import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sleep } from './support/browser.mjs';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

// 외부 QR 라이브러리는 테스트에서 막혀 있으므로, 불러오는 script 요소를 가로채 넣은 주소를 svg에 적는 대역으로 바꾼다
const FAKE_QR_LIBRARY = `(() => {
  window.__qrRequests = 0;
  const append = Node.prototype.appendChild;
  Node.prototype.appendChild = function (el) {
    if (el && el.tagName === 'SCRIPT' && el.src.includes('qrcode-generator')) {
      window.__qrRequests += 1;
      window.qrcode = () => {
        let data = '';
        return { addData: (text) => { data = text; }, make() {}, createSvgTag: () => '<svg data-url="' + data + '"></svg>' };
      };
      setTimeout(() => el.onload && el.onload(), 0);
      return el;
    }
    return append.call(this, el);
  };
})();`;

describe('시작하기 QR', { concurrency: true }, () => {
  test('데스크톱 너비에서는 QR 라이브러리를 불러와 iPhone과 Android QR을 각 스토어 주소로 그린다', async (t) => {
    const page = await landing.open(t, '/?utm_source=qr&utm_medium=test', { width: 1280, height: 900, initScript: FAKE_QR_LIBRARY });
    await page.waitFor(`document.getElementById('qrRow').classList.contains('ready')`, { what: 'QR 줄이 보인다' });
    assert.equal(await page.eval(`document.querySelector('#qrIos svg').dataset.url`), 'https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=landing_store&mt=8');
    assert.equal(await page.eval(`document.querySelector('#qrAndroid svg').dataset.url`),
      'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dqr%26utm_medium%3Dtest%26utm_campaign%3Dlanding_store');
  });

  test('900px보다 좁으면 QR 라이브러리를 불러오지 않는다', async (t) => {
    const page = await landing.open(t, '/', { width: 820, height: 900, initScript: FAKE_QR_LIBRARY });
    await sleep(500);
    assert.equal(await page.eval('window.__qrRequests'), 0);
    assert.equal(await page.eval(`document.getElementById('qrRow').classList.contains('ready')`), false);
  });
});
