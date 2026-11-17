import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playUrl } from '../shared/store-links.js';

test('랜딩 주소의 utm_source와 utm_medium은 Google Play referrer로 옮기고 캠페인은 landing_store로 둔다', () => {
  assert.equal(
    playUrl('?utm_source=threads&utm_medium=social&utm_campaign=threads_profile'),
    'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsocial%26utm_campaign%3Dlanding_store',
  );
});

test('utm이 없으면 referrer의 출처는 landing, 매체는 web이다', () => {
  assert.equal(
    playUrl(''),
    'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dlanding%26utm_medium%3Dweb%26utm_campaign%3Dlanding_store',
  );
});

test('utm 값에 &가 들어 있어도 referrer 안의 다른 값과 섞이지 않게 두 번 인코딩한다', () => {
  assert.equal(
    playUrl('?utm_source=a%26b&utm_medium=web'),
    'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Da%2526b%26utm_medium%3Dweb%26utm_campaign%3Dlanding_store',
  );
});
