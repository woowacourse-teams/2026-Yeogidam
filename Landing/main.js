// 랜딩 페이지의 스크립트를 붙인다. 각 섹션의 동작은 섹션 폴더에, 여러 섹션이 같이 쓰는 것은 shared에 있다
import { playUrl, tagPlayLinks, trackStoreClicks, loadQrCodes } from './shared/store-links.js';
import { REELS } from './demo/reels.js';
import { initDemo } from './demo/demo.js';
import { initTech } from './tech/tech.js';
import { initJourney } from './journey/journey.js';

var demo = initDemo(REELS);
var PLAY_URL = playUrl(location.search);
tagPlayLinks(PLAY_URL);
trackStoreClicks(function(){ return demo.progress(); });
loadQrCodes(PLAY_URL);
initTech();
initJourney();
