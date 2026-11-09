import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sleep } from './support/browser.mjs';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const CHIP_NAMES = ['전체', '카페', '디저트', '한식', '양식', '일식', '중식', '분식', '술집', '별미', '문화/여가', '기타'];

const waitForHint = (page, text) => page.waitFor(
  `document.getElementById('hint').classList.contains('on') && document.getElementById('hintText').textContent === ${JSON.stringify(text)}`,
  { what: `힌트 「${text}」가 보인다` },
);
const waitForToast = (page, text) => page.waitFor(
  `document.getElementById('ptoast').classList.contains('on') && document.getElementById('ptoast').textContent === ${JSON.stringify(text)}`,
  { what: `토스트 「${text}」가 보인다` },
);
const currentStep = (page) => page.eval(`document.querySelector('#steps .step.on')?.dataset.step ?? null`);
const demoSteps = async (page) => (await page.events('demo_step')).map((event) => event.params);
const ringState = (page) => page.eval(`document.getElementById('shareRing').dataset.state`);

async function shareAndOpenApp(page) {
  await page.waitForVisible('#scrReel');
  await page.click('#btnShare');
  await page.waitFor(`document.getElementById('sheet').classList.contains('on')`, { what: '공유 시트가 열린다' });
  await page.click('#btnYeogidam');
  await page.waitForVisible('#shareCard');
  await page.click('#btnOpenApp');
  await page.waitForVisible('#lib');
}

describe('히어로 데모', { concurrency: true }, () => {
  test('공유부터 지도 상세까지 힌트를 따라 누르면 단계마다 GA에 한 번씩 남고 끝 카드가 뜬다', async (t) => {
    const page = await landing.open(t);

    await page.waitForVisible('#scrReel');
    assert.equal(await page.isVisible('#scrApp'), false);
    assert.deepEqual(await page.texts('#steps .step'), ['1공유', '2분석', '3보관함', '4지도']);
    assert.equal(await currentStep(page), '0');
    assert.deepEqual(await page.texts('#chips .chip'), ['군자역 디저트 5곳', '강민경 차밥열끼 8곳']);
    assert.equal(await page.text('#chips .chip.on'), '군자역 디저트 5곳');
    await waitForHint(page, '공유를 눌러 보세요');
    assert.deepEqual(await demoSteps(page), []);

    await page.click('#btnShare');
    await page.waitFor(`document.getElementById('sheet').classList.contains('on')`, { what: '공유 시트가 열린다' });
    assert.equal(await page.text('#sheetTitle'), 'yeogidamm님의 게시물');
    await waitForHint(page, '여기담을 눌러 보세요');

    await page.click('#btnYeogidam');
    await page.waitForVisible('#shareCard');
    assert.equal(await currentStep(page), '1');
    assert.equal(await page.text('#shareCard b'), '공유 완료!');
    await waitForHint(page, '앱에서 보기를 눌러 보세요');

    await page.click('#btnOpenApp');
    await page.waitForVisible('#lib');
    assert.equal(await page.isVisible('#scrReel'), false);
    assert.deepEqual(await page.texts('#tabbar .tab'), ['보관함', '지도', '내 정보']);
    assert.equal(await page.text('#tabbar .tab.on'), '보관함');
    assert.equal(await page.text('#libEmptyTitle'), '담긴 게시물이 아직 없어요');
    await page.waitFor(`document.getElementById('shareRing').dataset.state === 'processing'`, { what: '링이 장소 찾는 중으로 바뀐다' });
    assert.equal(await page.text('#ringLabel'), '장소 찾는 중');

    await page.waitFor(`document.getElementById('shareRing').dataset.state === 'done'`, { what: '링이 완료로 바뀐다' });
    assert.equal(await page.text('#ringLabel'), '완료');
    assert.equal(await page.text('#ringCount'), '5');
    assert.equal(await page.text('#posts .post-card b'), '군자역 디저트 저장각 🍰');
    assert.equal(await page.text('#posts .post-count'), '5');
    assert.equal(await page.isVisible('#libEmpty'), false);
    assert.equal(await currentStep(page), '2');
    await waitForHint(page, '방금 공유한 게시물을 눌러 보세요');

    await page.click('#posts .post-card');
    await page.waitForVisible('#scrPost');
    assert.equal(await page.isVisible('#tabbar'), false);
    assert.equal(await page.text('#postCount'), '5');
    assert.deepEqual(await page.texts('#postPlaces .prow-name b'), ['윤숲 후르츠산도점', '에프씨씨', '책방고즈넉', '윤키', '연필']);
    await waitForHint(page, '보관함으로 돌아가 장소를 모아 봐요');

    await page.click('#btnPostBack');
    await page.waitForVisible('#lib');
    await waitForHint(page, '장소만 모아 볼 수도 있어요');

    await page.click('#viewPlaces');
    await page.waitForVisible('#places');
    assert.deepEqual(await page.texts('#libChips .cat-chip'), CHIP_NAMES);
    assert.equal(await page.count('#places .prow'), 5);
    await waitForHint(page, '지도 탭을 눌러 보세요');

    await page.click('#tabMap');
    await page.waitForVisible('#mapScr');
    assert.equal(await currentStep(page), '3');
    assert.deepEqual(await page.texts('#mapChips .cat-chip'), CHIP_NAMES);
    assert.equal(await page.count('#pins .pin'), 5);
    assert.deepEqual(await page.eval(`[...new Set([...document.querySelectorAll('#pins .pin img')].map((img) => img.getAttribute('src')))]`), ['assets/category-cafe.svg']);
    assert.equal(await page.count('#mlist .prow'), 5);
    await waitForHint(page, '핀을 눌러 보세요');

    await page.waitFor(`document.querySelectorAll('#pins .pin.drop').length === 5`, { what: '핀 5개가 모두 나타난다' });
    await page.click('#pins .pin');
    await page.waitForVisible('#mdetail');
    assert.equal(await page.text('#mdetail .dtitle b'), '윤숲 후르츠산도점');
    assert.equal(await page.text('#pins .pin.sel .pin-name'), '윤숲 후르츠산도점');
    await page.waitForVisible('#btnFinishMap');

    await page.click('#btnFinishMap');
    await page.waitForVisible('#endcard');
    assert.equal(await page.text('#endTitle'), '진짜 내 릴스로 해 보세요');
    assert.equal(await page.count('#steps .step.done'), 4);
    assert.equal(await currentStep(page), null);

    await page.click('#endcard .badges a.ios');
    assert.deepEqual(await page.events('store_click'), [
      { name: 'store_click', params: { store: 'app_store', placement: 'demo_end', demo_progress: 'end' } },
    ]);
    assert.deepEqual(await demoSteps(page), ['share', 'send', 'open_app', 'result', 'library', 'map', 'detail', 'end']
      .map((step) => ({ step, mode: 'tap' })));
    assert.deepEqual(page.problems, []);
  });

  test('다른 릴스 칩을 고르면 고른 릴스로 처음부터 시작하고, 지도에서 범주 칩으로 핀을 거른다', async (t) => {
    const page = await landing.open(t);
    await page.waitForVisible('#scrReel');

    await page.click('#chips .chip[data-id="chabap"]');
    assert.equal(await page.text('#chips .chip.on'), '강민경 차밥열끼 8곳');
    assert.match(await page.text('#reelCap'), /^먹잘알 강민경의 차밥열끼 시즌8/);

    await shareAndOpenApp(page);
    await page.waitFor(`document.getElementById('shareRing').dataset.state === 'done'`, { what: '링이 완료로 바뀐다' });
    assert.equal(await page.text('#ringCount'), '8');
    assert.equal(await page.text('#posts .post-card b'), '먹잘알 강민경의 차밥열끼 시즌8 🚗💨');

    await page.click('#tabMap');
    await page.waitFor(`document.querySelectorAll('#pins .pin.drop').length === 8`, { what: '핀 8개가 모두 나타난다' });
    assert.equal(await page.eval(`[...document.querySelectorAll('#mapSvg text')].some((el) => el.textContent === '강남구')`), true);
    assert.deepEqual(await page.eval(`[...new Set([...document.querySelectorAll('#pins .pin img')].map((img) => img.getAttribute('src')))].sort()`),
      ['assets/category-bunsik.svg', 'assets/category-chinese.svg', 'assets/category-japanese.svg', 'assets/category-korean.svg']);

    await page.click('#mapChips .cat-chip[data-code="JAPANESE"]');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#pins .pin')].map((pin) => pin.dataset.name)`), ['키노이에파티', '쿠노카츠']);
    assert.equal(await page.count('#mlist .prow'), 2);
    await page.click('#mapChips .cat-chip[data-code="ALL"]');
    assert.equal(await page.count('#pins .pin'), 8);

    await page.click('#pins .pin[data-name="꽃돌이네"]');
    await page.waitForVisible('#mdetail');
    assert.equal(await page.text('#mdetail .dtitle b'), '꽃돌이네');
    assert.deepEqual(await demoSteps(page), ['share', 'send', 'open_app', 'map', 'detail'].map((step) => ({ step, mode: 'tap' })));
    assert.deepEqual(page.problems, []);
  });

  test('분석 중에는 지도 탭을 막고, 끝나면 게시물 상세와 장소 상세, 칩, 정보 탭, 내 정보를 볼 수 있다', async (t) => {
    const page = await landing.open(t);
    await shareAndOpenApp(page);

    await page.click('#tabMap');
    await waitForToast(page, '장소를 확인하는 중이에요. 잠시만요');
    assert.equal(await page.text('#tabbar .tab.on'), '보관함');
    await page.waitFor(`document.getElementById('shareRing').dataset.state === 'processing'`, { what: '링이 장소 찾는 중으로 바뀐다' });
    await page.click('#shareRing');
    await waitForToast(page, '장소를 찾고 있어요.');

    await page.waitFor(`document.getElementById('shareRing').dataset.state === 'done'`, { what: '링이 완료로 바뀐다' });
    await page.click('#shareRing');
    await page.waitForVisible('#scrPost');
    await page.click('#btnReport');
    await page.waitForVisible('#confirm');
    assert.equal(await page.text('#confirmTitle'), '제보할까요?');
    await page.click('#confirmYes');
    await page.waitForText('#reportLabel', '제보 완료');

    await page.click('#postPlaces .prow');
    await page.waitForVisible('#scrDetail');
    assert.equal(await page.text('#dname'), '윤숲 후르츠산도점');
    assert.equal(await page.isVisible('#tabbar'), false);
    await page.click('#btnBack');
    await page.waitForVisible('#scrPost');
    await page.click('#btnPostBack');
    await page.waitForVisible('#lib');

    await page.click('#viewPlaces');
    await page.click('#libChips .cat-chip[data-code="KOREAN"]');
    assert.equal(await page.count('#places .prow'), 0);
    assert.equal(await page.text('#libEmptyTitle'), '한식 카테고리에 저장한 장소가 없어요');
    await page.click('#libChips .cat-chip[data-code="ALL"]');
    assert.equal(await page.count('#places .prow'), 5);
    assert.equal(await page.isVisible('#libEmpty'), false);

    await page.click('#places .prow');
    await page.waitForVisible('#scrDetail');
    assert.equal(await page.isVisible('#tabbar'), true);
    assert.equal(await page.text('#dbody .dtabs button.on'), '게시물');
    await page.click('#dbody .dtabs button[data-dtab="info"]');
    await page.waitForVisible('#dbody .dinfo');
    assert.equal(await page.isVisible('#dbody .dposts'), false);
    assert.deepEqual(await page.texts('#dbody .iline .k'), ['도로명', '지번']);
    await page.click('#scrDetail .dic.bm');
    await waitForToast(page, '데모에서는 여기담 흐름만 눌러 볼 수 있어요');

    await page.click('#btnBack');
    await page.waitForVisible('#lib');
    await page.click('#btnAddLink');
    await waitForToast(page, '링크를 붙여 넣어 직접 추가할 수도 있어요');

    await page.click('#tabProfile');
    await page.waitForVisible('#profile');
    assert.equal(await page.text('#profile .pname'), '담이 3432');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#profile .plist div')].map((item) => item.firstChild.textContent)`),
      ['사용 가이드', '약관 동의', '문의하기', '회원탈퇴', '로그아웃']);
    assert.deepEqual(page.problems, []);
  });

  test('공유 카드를 누르지 않으면 4초 뒤 닫히고, 홈 화면의 여기담 아이콘으로 앱을 연다', async (t) => {
    const page = await landing.open(t);
    await page.waitForVisible('#scrReel');
    await page.click('#btnShare');
    await page.waitFor(`document.getElementById('sheet').classList.contains('on')`, { what: '공유 시트가 열린다' });
    await page.click('#btnYeogidam');
    await page.waitForVisible('#shareCard');
    await sleep(3000);
    assert.equal(await page.isVisible('#shareCard'), true);
    await page.waitForVisible('#launch');
    assert.equal(await page.isVisible('#shareCard'), false);
    await waitForHint(page, '이제 여기담 앱을 열어 보세요');

    await page.click('#btnLaunch');
    await page.waitForVisible('#lib');
    assert.deepEqual(await demoSteps(page), ['share', 'send', 'open_app'].map((step) => ({ step, mode: 'tap' })));
    assert.equal(await ringState(page), 'pending');
  });
});
