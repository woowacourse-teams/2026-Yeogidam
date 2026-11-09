import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const playUrl = (source, medium) => 'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer='
  + encodeURIComponent(`utm_source=${source}&utm_medium=${medium}&utm_campaign=landing_store`);
const storeHrefs = (page, host) => page.eval(`[...new Set([...document.querySelectorAll('a[href*="${host}"]')].map((a) => a.href))]`);

describe('스토어 링크', { concurrency: true }, () => {
  test('랜딩에 붙어 온 utm_source와 utm_medium을 Google Play 링크의 referrer로 옮긴다', async (t) => {
    const page = await landing.open(t, '/?utm_source=threads&utm_medium=social&utm_campaign=threads_profile');
    assert.deepEqual(await storeHrefs(page, 'play.google.com'), [playUrl('threads', 'social')]);
    assert.deepEqual(await storeHrefs(page, 'apps.apple.com'), ['https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=landing_store&mt=8']);
  });

  test('utm이 없으면 Google Play 링크의 referrer는 landing과 web이다', async (t) => {
    const page = await landing.open(t);
    assert.deepEqual(await storeHrefs(page, 'play.google.com'), [playUrl('landing', 'web')]);
  });

  test('스토어 버튼을 누르면 누른 자리와 데모를 어디까지 봤는지를 store_click으로 남긴다', async (t) => {
    const page = await landing.open(t);
    await page.click('.hero .badges a.ios');
    await page.click('#start .badges a.play');
    await page.click('.foot a[href*="apps.apple.com"]');
    assert.deepEqual((await page.events('store_click')).map((event) => event.params), [
      { store: 'app_store', placement: 'hero', demo_progress: 'none' },
      { store: 'google_play', placement: 'start', demo_progress: 'none' },
      { store: 'app_store', placement: 'footer', demo_progress: 'none' },
    ]);
    assert.deepEqual(page.problems, []);
  });
});
