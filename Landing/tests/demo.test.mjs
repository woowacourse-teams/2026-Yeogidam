import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { useLanding } from './support/landing.mjs';

const landing = useLanding();

const waitForHint = (page, text) => page.waitFor(
  `document.getElementById('hint').classList.contains('on') && document.getElementById('hintText').textContent === ${JSON.stringify(text)}`,
  { what: `힌트 「${text}」가 보인다` },
);
const currentStep = (page) => page.eval(`document.querySelector('#steps .step.on')?.dataset.step ?? null`);
const demoSteps = async (page) => (await page.events('demo_step')).map((event) => event.params);

describe('히어로 데모', { concurrency: true }, () => {
  test('공유부터 지도 상세까지 눌러 따라가면 단계마다 GA에 한 번씩 남고 끝 카드가 뜬다', async (t) => {
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
    await waitForHint(page, '여기담을 눌러 보세요');

    await page.click('#btnYeogidam');
    await page.waitForVisible('#rwrap');
    assert.equal(await currentStep(page), '1');
    assert.equal(await page.text('#rtext'), '공유한 내용을 확인하고 있어요.');
    await page.waitForText('#rtext', '링크를 받았어요. 여기담 앱에서 확인해 주세요.');
    await page.waitForVisible('#launch');
    await waitForHint(page, '이제 여기담 앱을 열어 보세요');

    await page.click('#btnLaunch');
    await page.waitForVisible('#histList');
    assert.equal(await page.text('#hiBadge'), '처리중');
    assert.equal(await page.text('#tabbar .tab.on'), '히스토리');
    await page.waitForText('#hiBadge', '성공');
    await waitForHint(page, '눌러서 결과를 봐요');

    await page.click('#histItem');
    await page.waitForVisible('#histDetail');
    assert.equal(await page.text('#hdTitle'), '장소 분석이 완료되었어요!');
    assert.equal(await page.text('#hdSub'), '총 5개의 장소를 찾았어요');
    assert.deepEqual(await page.texts('#hdRow .hpc b'), ['윤숲 후르츠산도점', '에프씨씨', '책방고즈넉', '윤키', '연필']);
    await waitForHint(page, '보관함에서 꺼내 봐요');

    await page.click('#tabLib');
    await page.waitForVisible('#grid .pcard');
    assert.equal(await page.count('#grid .pcard'), 5);
    assert.equal(await page.isVisible('#empty'), false);
    assert.equal(await currentStep(page), '2');
    await waitForHint(page, '지도 탭을 눌러 보세요');

    await page.click('#tabMap');
    await page.waitForVisible('#mapScr');
    assert.equal(await page.count('#pins .pin'), 5);
    assert.equal(await page.count('#mlist .mitem'), 5);
    assert.equal(await currentStep(page), '3');
    await waitForHint(page, '핀을 눌러 보세요');

    await page.click('#pins .pin');
    await page.waitForVisible('#mdetail');
    assert.equal(await page.text('#mdetail .dtitle b'), '윤숲 후르츠산도점');
    assert.equal(await page.eval(`document.querySelector('#pins .pin.sel img').getAttribute('src')`), 'assets/marker-selected.png');
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

  test('다른 릴스 칩을 고르면 고른 릴스로 처음부터 시작하고 지도에 장소 8곳이 뜬다', async (t) => {
    const page = await landing.open(t);
    await page.waitForVisible('#scrReel');

    await page.click('#chips .chip[data-id="chabap"]');
    assert.equal(await page.text('#chips .chip.on'), '강민경 차밥열끼 8곳');
    assert.match(await page.text('#reelCap'), /^먹잘알 강민경의 차밥열끼 시즌8/);
    assert.equal(await page.text('#hiTitle'), '먹잘알 강민경의 차밥열끼 시즌8 🚗💨');

    await page.click('#btnShare');
    await page.waitFor(`document.getElementById('sheet').classList.contains('on')`, { what: '공유 시트가 열린다' });
    await page.click('#btnYeogidam');
    await page.waitForVisible('#launch');
    await page.click('#btnLaunch');
    await page.waitForText('#hiBadge', '성공');

    await page.click('#tabLib');
    await page.waitForVisible('#grid .pcard');
    assert.equal(await page.count('#grid .pcard'), 8);

    await page.click('#tabMap');
    await page.waitForVisible('#pins .pin');
    assert.equal(await page.count('#pins .pin'), 8);
    assert.equal(await page.eval(`[...document.querySelectorAll('#mapSvg text')].some((el) => el.textContent === '강남구')`), true);

    await page.waitFor(`document.querySelectorAll('#pins .pin.drop').length === 8`, { what: '핀 8개가 모두 떨어진다' });
    await page.click('#pins .pin:nth-child(4)');
    await page.waitForVisible('#mdetail');
    assert.equal(await page.text('#mdetail .dtitle b'), '꽃돌이네');
    assert.deepEqual(await demoSteps(page), ['share', 'send', 'open_app', 'library', 'map', 'detail']
      .map((step) => ({ step, mode: 'tap' })));
    assert.deepEqual(page.problems, []);
  });

  test('분석 중에는 보관함 탭을 막고, 끝나면 보관함 카드에서 장소 상세와 정보 탭, 내 정보 탭을 볼 수 있다', async (t) => {
    const page = await landing.open(t);
    await page.waitForVisible('#scrReel');
    await page.click('#btnShare');
    await page.waitFor(`document.getElementById('sheet').classList.contains('on')`, { what: '공유 시트가 열린다' });
    await page.click('#btnYeogidam');
    await page.waitForVisible('#launch');
    await page.click('#btnLaunch');
    await page.waitForVisible('#histList');

    await page.click('#tabLib');
    await page.waitFor(`document.getElementById('ptoast').classList.contains('on')`, { what: '토스트가 뜬다' });
    assert.equal(await page.text('#ptoast'), '장소를 확인하는 중이에요. 잠시만요');
    assert.equal(await page.text('#tabbar .tab.on'), '히스토리');

    await page.waitForText('#hiBadge', '성공');
    await page.click('#histItem');
    await page.waitForVisible('#histDetail');
    await page.click('#btnHistBack');
    await page.waitForVisible('#histList');
    assert.equal(await page.isVisible('#histDetail'), false);

    await page.click('#tabLib');
    await page.waitForVisible('#grid .pcard');
    await page.click('#grid .pcard');
    await page.waitForVisible('#scrDetail');
    assert.equal(await page.text('#dname'), '윤숲 후르츠산도점');
    assert.equal(await page.text('#dbody .dtabs button.on'), '게시물');
    await page.click('#dbody .dtabs button[data-dtab="info"]');
    await page.waitForVisible('#dbody .dinfo');
    assert.equal(await page.isVisible('#dbody .dposts'), false);
    assert.deepEqual(await page.texts('#dbody .iline .k'), ['도로명', '지번']);
    await page.click('#btnMore');
    await page.waitForText('#ptoast', '더 보기에는 삭제하기가 있어요');

    await page.click('#btnBack');
    await page.waitForVisible('#lib');
    assert.equal(await page.isVisible('#scrDetail'), false);
    await page.click('#fab');
    await page.waitForText('#ptoast', '링크를 붙여 넣어 직접 추가할 수도 있어요');

    await page.click('#tabbar .tab[data-tab="profile"]');
    await page.waitForVisible('#profile');
    assert.equal(await page.isVisible('#appHead'), false);
    assert.equal(await page.text('#profile .pname'), '담이 3432');
    assert.deepEqual(page.problems, []);
  });
});
