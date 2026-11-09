// 랜딩 페이지의 스크립트를 붙인다. 각 섹션의 동작은 섹션 폴더에, 여러 섹션이 같이 쓰는 것은 shared에 있다
import { playUrl, tagPlayLinks, trackStoreClicks, loadQrCodes } from './shared/store-links.js';
import { REELS } from './demo/reels.js';
import { initDemo } from './demo/demo.js';
import { initTech } from './tech/tech.js';
import { initJourney } from './journey/journey.js';

// 섹션 하나가 실패해도 스토어 링크와 다른 섹션은 붙도록 따로 실행하고, 실패는 콘솔에 남긴다
function start(name, init) {
  try {
    return init();
  } catch (error) {
    console.error(`랜딩 ${name} 붙이기에 실패했다`, error);
    return null;
  }
}

// 스토어 링크는 설치로 이어지는 길이라 가장 먼저 붙인다. 데모 진행 단계는 데모가 붙은 뒤에만 읽는다
var PLAY_URL = playUrl(location.search);
tagPlayLinks(PLAY_URL);
var demo = null;
trackStoreClicks(function(){ return demo ? demo.progress() : 'none'; });
start('QR', function(){ loadQrCodes(PLAY_URL); });
demo = start('데모', function(){ return initDemo(REELS); });
start('기술 섹션', initTech);
start('품질 섹션', initJourney);
