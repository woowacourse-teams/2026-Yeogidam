// 랜딩 페이지 스크립트. 히어로 데모, 스토어 링크, QR, 기술 섹션, 품질 섹션을 붙인다
import { track } from './shared/analytics.js';
import { reduceMotion as reduce } from './shared/motion.js';

var $ = function(id){ return document.getElementById(id); };

/* ---------- 데모 데이터 ---------- */
var REELS = [
  {
    id:'gunja', chip:'군자역 디저트 5곳', author:'@yeogidamm', av:'담', likes:'1.2만', comments:'36',
    title:'군자역 디저트 저장각 🍰', emoji:'🍰', tone:'t1', theme:'pink',
    caption:'군자역 디저트 저장각 🍰 📍오픈 한 달 만에 방문자리뷰 500개 넘긴 후르츠산도 맛집, 윤숲 📍다이닝코드 맛 평가 4.6, 과일 크레이프가 유명한, FCC 📍군자역 도보 3분, 책 읽기 좋은 북카페, 책방 고즈넉 📍에그타르트로 후기 많은 골목 디저트 카페, 윤키 📍필터커피 후기가 좋은 카페, 연필',
    link:'instagram.com/p/Db4gRWqkuUg', post:'https://www.instagram.com/p/Db4gRWqkuUg/', thumb:'assets/reel-gunja.jpg', scatter:['🍰','🍓','🥞','☕','🥧','🍰','📚','🍓'],
    mapLabel:'군자역', map:'gunja',
    places:[
      {name:'윤숲 후르츠산도점', cat:'음식점 > 카페', road:'서울 광진구 면목로7길 8', lot:'서울 광진구 중곡동 628-7', url:'https://place.map.kakao.com/1775568752', img:'assets/place-1775568752.jpg', emoji:'🥪', tone:'t1', x:33, y:17},
      {name:'에프씨씨', cat:'음식점 > 카페', road:'서울 광진구 용마산로3길 88', lot:'서울 광진구 중곡동 134-1', url:'https://place.map.kakao.com/137070444', img:'assets/place-137070444.jpg', emoji:'🥞', tone:'t2', x:80, y:28},
      {name:'책방고즈넉', cat:'음식점 > 카페', road:'서울 광진구 동일로60길 41-13', lot:'서울 광진구 군자동 467-15', url:'https://place.map.kakao.com/337953507', img:'assets/place-337953507.jpg', emoji:'📚', tone:'t3', x:25, y:25},
      {name:'윤키', cat:'음식점 > 카페 > 테마카페 > 디저트카페', road:'서울 광진구 능동로38길 27', lot:'서울 광진구 중곡동 142-21', url:'https://place.map.kakao.com/98016856', img:'assets/place-98016856.jpg', emoji:'🥧', tone:'t4', x:65, y:27},
      {name:'연필', cat:'음식점 > 카페 > 커피전문점', road:'서울 광진구 면목로 12', lot:'서울 광진구 군자동 49-17', url:'https://place.map.kakao.com/1107844606', img:'assets/place-1107844606.jpg', emoji:'☕', tone:'t5', x:20, y:37}
    ]
  },
  {
    id:'chabap', chip:'강민경 차밥열끼 8곳', author:'@yeogidamm', av:'담', likes:'2,048', comments:'31',
    title:'먹잘알 강민경의 차밥열끼 시즌8 🚗💨', emoji:'🍱', tone:'t4', theme:'pink',
    caption:'먹잘알 강민경의 차밥열끼 시즌8 🚗💨 영상 보면서 여긴 꼭 가야겠다 싶었던 맛집 8곳을 싹 정리해왔어요! 🍽️ 📍 키노이에 파티 📍 홍춘 📍 화덕돌곱창 📍 꽃돌이네 📍 수족관 📍 쿠노카츠 강남본점 📍 보영만두 📍 김빠',
    link:'instagram.com/p/DebnmRckoy1', post:'https://www.instagram.com/p/DebnmRckoy1/', thumb:'assets/reel-chabap.jpg', scatter:['🍱','🥩','🍜','🥟','🍣','🍛','🥢','🍚'],
    mapLabel:'강남구', map:'metro',
    places:[
      {name:'키노이에파티', cat:'음식점 > 일식', road:'서울 강남구 도산대로72길 8', lot:'서울 강남구 청담동 5-7', url:'https://place.map.kakao.com/527159312', img:'assets/place-527159312.jpg', emoji:'🍣', tone:'t1', x:60, y:19},
      {name:'홍춘', cat:'음식점 > 중식', road:'경기 용인시 수지구 죽전로168번길 29', lot:'경기 용인시 수지구 죽전동 1336-6', url:'https://place.map.kakao.com/18042790', img:'assets/place-18042790.jpg', emoji:'🥟', tone:'t2', x:70, y:37},
      {name:'화덕돌곱창', cat:'음식점 > 한식 > 육류,고기 > 곱창,막창', road:'충북 청주시 서원구 안뜸로 60', lot:'충북 청주시 서원구 분평동 249-6', url:'https://place.map.kakao.com/2014608758', img:'assets/place-2014608758.jpg', emoji:'🍖', tone:'t3', x:84, y:41},
      {name:'꽃돌이네', cat:'음식점 > 한식 > 육류,고기', road:'서울 강남구 언주로174길 29', lot:'서울 강남구 신사동 639-7', url:'https://place.map.kakao.com/2033985372', img:'assets/place-2033985372.jpg', emoji:'🥩', tone:'t4', x:40, y:23},
      {name:'수족관', cat:'음식점 > 한식 > 해물,생선', road:'서울 강남구 도산대로37길 30', lot:'서울 강남구 신사동', url:'https://place.map.kakao.com/969282150', img:'assets/place-969282150.jpg', emoji:'🐟', tone:'t6', x:52, y:29},
      {name:'쿠노카츠', cat:'음식점 > 일식 > 돈까스,우동', road:'서울 서초구 서운로 226', lot:'서울 서초구 서초동', url:'https://place.map.kakao.com/1513233857', img:'assets/place-1513233857.jpg', emoji:'🍛', tone:'t5', x:30, y:33},
      {name:'보영만두 북문본점', cat:'음식점 > 분식', road:'경기 수원시 장안구 팔달로 271', lot:'경기 수원시 장안구 영화동 282-3', url:'https://place.map.kakao.com/27135707', img:'assets/place-27135707.jpg', emoji:'🥟', tone:'t2', x:18, y:40},
      {name:'태양옥김빠', cat:'음식점 > 분식', road:'서울 강동구 성내로 42', lot:'서울 강동구 성내동 550-5', url:'https://place.map.kakao.com/1583503104', img:'assets/place-1583503104.jpg', emoji:'🍙', tone:'t1', x:86, y:21}
    ]
  }
];

/* ---------- 요소 ---------- */
var phoneWrap=$('phoneWrap'), phone=$('phone'), screen=$('screen'), sbar=$('sbar');
var scrReel=$('scrReel'), reelBg=$('reelBg'), reelCap=$('reelCap'), reelAuthor=$('reelAuthor'), reelAv=$('reelAv'), reelLikes=$('reelLikes'), reelComments=$('reelComments');
var scrim=$('scrim'), sheet=$('sheet'), sheetThumb=$('sheetThumb'), sheetLink=$('sheetLink');
var rwrap=$('rwrap'), rtext=$('rtext'), launch=$('launch'), btnLaunch=$('btnLaunch');
var scrApp=$('scrApp'), appHead=$('appHead'), headAvatar=$('headAvatar'), btnMapBack=$('btnMapBack'), lib=$('lib'), libTools=$('libTools');
var histList=$('histList'), histDetail=$('histDetail'), histItem=$('histItem'), hiDate=$('hiDate'), hiThumb=$('hiThumb'), hiBadge=$('hiBadge'), hiTitle=$('hiTitle'), hiChev=$('hiChev'), hdThumb=$('hdThumb'), hdTitle=$('hdTitle'), hdSub=$('hdSub'), hdOrig=$('hdOrig'), hdFound=$('hdFound'), hdRow=$('hdRow'), hdFail=$('hdFail');
var empty=$('empty'), grid=$('grid'), fab=$('fab'), tabbar=$('tabbar');
var mapScr=$('mapScr'), mapSvg=$('mapSvg'), pins=$('pins'), msheet=$('msheet'), mlist=$('mlist'), mdetail=$('mdetail'), btnFinishMap=$('btnFinishMap');
var scrDetail=$('scrDetail'), dname=$('dname'), dbody=$('dbody'), btnFinishIn=$('btnFinishIn');
var confirmBox=$('confirm'), confirmTitle=$('confirmTitle');
var endcard=$('endcard'), endTitle=$('endTitle'), endText=$('endText');
var ptoast=$('ptoast'), hint=$('hint'), hintText=$('hintText');
var steps=$('steps'), btnReset=$('btnReset'), btnAuto=$('btnAuto'), btnFinish=$('btnFinish'), chips=$('chips');

var reel=REELS[0], auto=false, run=0, timers=[], state='feed', analysed=false, tab='lib', hintTarget=null, toastTimer=null, mapRun=0, gridRevealed=false, confirmYes=null;

/* ---------- 유틸 ---------- */
function later(ms, fn){ var id=setTimeout(fn, ms); timers.push(id); return id; }
function autoLater(ms, fn){ var id=run; later(ms, function(){ if (auto && id===run) fn(); }); }
function stagger(ms){ return reduce ? 0 : ms; }
function clearTimers(){ timers.forEach(clearTimeout); timers=[]; }
function scale(){ return parseFloat(getComputedStyle(phone).getPropertyValue('--s'))||1; }
function fit(){
  var avail=phoneWrap.parentNode.clientWidth;
  var vh=window.visualViewport ? window.visualViewport.height : window.innerHeight;
  var byHeight=Math.max(0.8, Math.min(1, (vh-130)/720));
  var s=Math.min(1, avail/360, byHeight);
  phone.style.setProperty('--s', s);
  phoneWrap.style.width=(360*s)+'px'; phoneWrap.style.height=(720*s)+'px';
}
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function toast(msg){
  ptoast.textContent=msg; ptoast.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){ ptoast.classList.remove('on'); }, 1800);
}
function setStep(n){
  var items=steps.querySelectorAll('.step');
  for (var i=0;i<items.length;i++){ items[i].classList.toggle('on', i===n); items[i].classList.toggle('done', i<n); if (i===n) items[i].setAttribute('aria-current','step'); else items[i].removeAttribute('aria-current'); }
  if (n>=4) for (var j=0;j<items.length;j++){ items[j].classList.add('done'); items[j].classList.remove('on'); }
}
function hideHint(){ hint.classList.remove('on'); hintTarget=null; }
function showHint(target, text, pos){
  if (!target || target.hidden) return;
  hintTarget=target; hintText.textContent=text;
  hint.className='hint '+(pos||'top');
  var s=scale(), sr=screen.getBoundingClientRect(), tr=target.getBoundingClientRect();
  var x=(tr.left-sr.left)/s + tr.width/s/2, y=(tr.top-sr.top)/s + tr.height/s/2;
  hint.style.left=x+'px'; hint.style.top=y+'px';
  var w=hintText.offsetWidth, sw=screen.clientWidth, pad=12, shift=0;
  if (pos==='left'){ if (x-40-w < pad){ hint.className='hint top'; pos='top'; } }
  if (pos!=='left'){
    if (x - w/2 < pad) shift = pad - (x - w/2);
    else if (x + w/2 > sw - pad) shift = (sw - pad) - (x + w/2);
  }
  hintText.style.marginLeft = shift+'px';
  hint.classList.add('on');
}
function showScreen(which){
  scrReel.hidden = which!=='reel'; scrApp.hidden = which!=='app'; scrDetail.hidden = which!=='detail';
  tabbar.hidden = which==='reel';
  sbar.classList.toggle('light', which==='reel');
}
function tileHTML(cls, emoji){ return '<span class="tile '+cls+'">'+emoji+'</span>'; }
function imgOrTile(src, cls, emoji, imgClass){ return src ? '<img class="'+(imgClass||'')+'" src="'+src+'" alt="" loading="lazy">' : tileHTML(cls, emoji); }
function fillThumb(el, src, cls, emoji){ el.className=el.className.replace(/\btile\b|\bt\d\b/g,'').trim(); if (src){ el.innerHTML='<img src="'+src+'" alt="">'; } else { el.className+=' tile '+cls; el.textContent=emoji; } }
function midCat(c){ var a=c.split('>').map(function(s){return s.trim();}).filter(Boolean); return a[1]||a[0]||''; }
function todayLabel(){ var d=new Date(); return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'); }
function askConfirm(title, fn){ confirmTitle.textContent=title; confirmYes=fn; confirmBox.hidden=false; }

/* ---------- 방문 통계(GA4): 데모 단계는 페이지를 열 때마다 단계별로 한 번만 보낸다 ---------- */
var STEPS=['share','send','open_app','result','library','map','detail','end'], reached={}, furthest='none';
function mark(step){
  if (reached[step]) return; reached[step]=true;
  if (STEPS.indexOf(step) > STEPS.indexOf(furthest)) furthest=step;
  track('demo_step', {step: step, mode: auto ? 'auto' : 'tap'});
}
function placementOf(a){
  if (a.closest('#endcard')) return 'demo_end';
  if (a.closest('.hero')) return 'hero';
  if (a.closest('#start')) return 'start';
  if (a.closest('.foot')) return 'footer';
  return 'other';
}

/* ---------- 릴스 준비 ---------- */
function setReel(r){
  reel=r;
  var spots=[[8,16],[62,12],[80,30],[18,40],[48,48],[72,58],[28,66],[58,74]];
  if (r.thumb){ reelBg.className='reel-bg photo'; reelBg.innerHTML='<img class="blur" src="'+r.thumb+'" alt=""><img class="fit" src="'+r.thumb+'" alt="">'; }
  else { reelBg.className='reel-bg '+r.theme; reelBg.innerHTML=r.scatter.map(function(e,i){ var p=spots[i%spots.length]; return '<span style="left:'+p[0]+'%;top:'+p[1]+'%;font-size:'+(34+(i%3)*10)+'px">'+e+'</span>'; }).join(''); }
  reelCap.textContent=r.caption; reelAuthor.textContent=r.author; reelAv.textContent=r.av; reelLikes.textContent=r.likes; reelComments.textContent=r.comments;
  fillThumb(sheetThumb, r.thumb, r.tone, r.emoji); sheetLink.textContent=r.link;
  fillThumb(hiThumb, r.thumb, r.tone, r.emoji); fillThumb(hdThumb, r.thumb, r.tone, r.emoji); hiTitle.textContent=r.title; hdOrig.href=r.post||'#';
  var cs=chips.querySelectorAll('.chip'); for (var i=0;i<cs.length;i++) cs[i].classList.toggle('on', cs[i].dataset.id===r.id);
}

/* ---------- 상태 전이 ---------- */
function reset(r){
  run++; clearTimers(); hideHint(); analysed=false; tab='lib';
  setReel(r||reel);
  scrim.classList.remove('on'); sheet.classList.remove('on'); rwrap.hidden=true; launch.hidden=true; rtext.textContent='공유한 내용을 확인하고 있어요.';
  grid.innerHTML=''; empty.hidden=false; libTools.hidden=true; pins.innerHTML=''; mlist.innerHTML=''; mdetail.innerHTML=''; mdetail.hidden=true; mlist.hidden=false; msheet.classList.remove('on'); gridRevealed=false;
  headAvatar.hidden=false; btnMapBack.hidden=true; btnFinishMap.hidden=true; confirmBox.hidden=true;
  hiDate.textContent=todayLabel(); hiBadge.className='badge wait'; hiBadge.textContent='처리중'; hiChev.hidden=true; histDetail.hidden=true; hdFail.hidden=true;
  endcard.hidden=true; btnFinish.hidden=true; ptoast.classList.remove('on'); $('btnReport').textContent='제보하기'; mapRun++;
  showTab('lib', true); showScreen('reel'); state='feed'; setStep(0);
  var id=run;
  later(900, function(){ if (id!==run||state!=='feed') return; showHint($('btnShare'), '공유를 눌러 보세요', 'left'); });
  autoLater(2300, tapShare);
}
function tapShare(){
  if (state!=='feed') return;
  state='share'; mark('share'); hideHint(); scrim.classList.add('on'); sheet.classList.add('on');
  var id=run;
  later(700, function(){ if (id!==run||state!=='share') return; showHint($('btnYeogidam'), '여기담을 눌러 보세요', 'top'); });
  autoLater(1900, tapYeogidam);
}
function closeSheet(){
  if (state!=='share') return;
  state='feed'; hideHint(); scrim.classList.remove('on'); sheet.classList.remove('on');
  var id=run; later(800, function(){ if (id!==run||state!=='feed') return; showHint($('btnShare'), '공유를 눌러 보세요', 'left'); });
}
/* 앱의 공유 확장과 같이 결과 문구를 띄운 뒤 2초가 지나면 스스로 닫힌다 */
function tapYeogidam(){
  if (state!=='share') return;
  state='receiving'; mark('send'); hideHint(); setStep(1); sheet.classList.remove('on'); scrim.classList.remove('on');
  var id=run;
  later(250, function(){ if (id!==run) return; rwrap.hidden=false; });
  later(1500, function(){ if (id!==run) return; rtext.textContent='링크를 받았어요. 여기담 앱에서 확인해 주세요.'; });
  later(3500, function(){
    if (id!==run) return;
    rwrap.hidden=true; state='shared'; launch.hidden=false;
    later(400, function(){ if (id!==run||state!=='shared') return; showHint(btnLaunch, '이제 여기담 앱을 열어 보세요', 'bottom'); });
    autoLater(1400, openApp);
  });
}
function openApp(){
  if (state!=='shared') return;
  state='history'; mark('open_app'); hideHint(); launch.hidden=true; showScreen('app'); showTab('history', true);
  hiBadge.className='badge wait'; hiBadge.textContent='처리중'; hiChev.hidden=true;
  var id=run;
  later(3400, function(){ if (id!==run) return; analysisDone(id); });
}
function analysisDone(id){
  analysed=true;
  if (reel.places.length){
    hiBadge.className='badge ok'; hiBadge.textContent='성공';
    grid.innerHTML='';
    reel.places.forEach(function(p){
      var b=document.createElement('button'); b.type='button'; b.className='pcard';
      b.innerHTML=imgOrTile(p.img, p.tone, p.emoji, 'timg')+'<span class="cap"><b>'+esc(p.name)+'</b><small>'+esc(p.road)+'</small></span>';
      b.addEventListener('click', function(){ openDetail(p); });
      grid.appendChild(b);
    });
  } else { hiBadge.className='badge ng'; hiBadge.textContent='실패'; }
  hiChev.hidden=false;
  later(600, function(){ if (id!==run||state!=='history') return; showHint(histItem, '눌러서 결과를 봐요', 'bottom'); });
  autoLater(1800, openHistDetail);
}
function openHistDetail(){
  if (!analysed || state!=='history') return;
  state='historyDetail'; mark('result'); hideHint(); histList.hidden=true; histDetail.hidden=false;
  var ok=reel.places.length>0;
  hdTitle.textContent= ok ? '장소 분석이 완료되었어요!' : '장소 분석에 실패했어요ㅠ';
  hdSub.textContent= ok ? '총 '+reel.places.length+'개의 장소를 찾았어요' : reel.fail;
  hdFound.hidden=!ok; hdRow.hidden=!ok; hdFail.hidden=ok;
  hdRow.innerHTML=reel.places.map(function(p){ return '<div class="hpc">'+(p.img ? '<img src="'+p.img+'" alt="">' : '<span class="tile '+p.tone+'" style="display:grid;width:92px;height:92px;border-radius:3px;font-size:36px">'+p.emoji+'</span>')+'<b>'+esc(p.name)+'</b><small>'+esc(p.road)+'</small></div>'; }).join('');
  var id=run;
  if (ok){
    later(2500, function(){ if (id!==run||state!=='historyDetail') return; showHint($('tabLib'), '보관함에서 꺼내 봐요', 'top'); });
    autoLater(3200, function(){ if (state==='historyDetail') showTab('lib'); });
  } else {
    later(3200, function(){ if (id!==run) return; finish('장소가 없으면 이렇게 알려 드려요', '실패한 릴스는 히스토리에 남아요. 다시 시도하거나 제보 버튼으로 팀에 알릴 수 있어요.'); });
  }
}
function backFromHistDetail(){ if (state!=='historyDetail') return; hideHint(); histDetail.hidden=true; histList.hidden=false; state='history'; }
function revealGrid(){
  if (gridRevealed) return; gridRevealed=true; empty.hidden=true; libTools.hidden=false;
  var cards=grid.querySelectorAll('.pcard'), id=run;
  for (var i=0;i<cards.length;i++) (function(b,i){ later(120+stagger(i*90), function(){ if (id===run) b.classList.add('in'); }); })(cards[i], i);
  setStep(2); mark('library');
  later(400+cards.length*90+900, function(){ if (id!==run||state!=='lib') return; showHint($('tabMap'), '지도 탭을 눌러 보세요', 'top'); });
  autoLater(400+cards.length*90+2300, function(){ if (state==='lib') showTab('map'); });
}
function showTab(name, silent){
  tab=name;
  lib.hidden = name!=='lib'; mapScr.hidden = name!=='map'; $('profile').hidden = name!=='profile';
  histList.hidden = name!=='history'; histDetail.hidden = true;
  fab.hidden = name!=='lib'; appHead.hidden = (name==='profile'||name==='history');
  scrApp.classList.toggle('on-map', name==='map'); scrApp.classList.toggle('on-history', name==='history');
  if (name!=='map') leaveMapDetail();
  var ts=tabbar.querySelectorAll('.tab'); for (var i=0;i<ts.length;i++) ts[i].classList.toggle('on', ts[i].dataset.tab===name);
  if (silent) return;
  hideHint();
  if (name==='map'){ state='map'; setStep(3); mark('map'); renderMap(); }
  else if (name==='lib'){ state='lib'; if (analysed && reel.places.length) revealGrid(); }
  else if (name==='history'){ state='history'; }
  else { state='profile'; }
}
function renderMap(){
  mapSvg.innerHTML=mapSVG(reel); pins.innerHTML=''; mlist.innerHTML=''; msheet.classList.remove('on');
  var id=run, mid=++mapRun;
  reel.places.forEach(function(p,i){
    var b=document.createElement('button'); b.type='button'; b.className='pin'; b.style.left=p.x+'%'; b.style.top=p.y+'%'; b.dataset.i=i;
    b.setAttribute('aria-label', p.name);
    b.innerHTML='<img src="assets/marker.png" alt="">';
    b.addEventListener('click', function(){ openDetail(p); });
    pins.appendChild(b);
    later(250+stagger(i*140), function(){ if (id===run&&mid===mapRun) b.classList.add('drop'); });
    var m=document.createElement('button'); m.type='button'; m.className='mitem';
    m.innerHTML=(p.img ? '<span class="thumb"><img src="'+p.img+'" alt="" loading="lazy"></span>' : '<span class="thumb tile '+p.tone+'">'+p.emoji+'</span>')+'<span style="min-width:0;display:block"><b>'+esc(p.name)+'</b><span class="mcat">'+esc(midCat(p.cat))+'</span><small>'+esc(p.road)+'</small></span>';
    m.addEventListener('click', function(){ openDetail(p); });
    mlist.appendChild(m);
  });
  later(400+reel.places.length*140, function(){ if (id===run&&mid===mapRun) msheet.classList.add('on'); });
  later(1200+reel.places.length*140, function(){ if (id!==run||mid!==mapRun||state!=='map') return; var first=pins.querySelector('.pin'); if (first) showHint(first, '핀을 눌러 보세요', 'top'); });
  autoLater(2600+reel.places.length*140, function(){ if (mid===mapRun&&state==='map') openDetail(reel.places[0]); });
}

/* ---------- 장소 상세(앱 구성: 카테고리, 주소, 버튼 두 개, 사진, 탭) ---------- */
var ICON_TAG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>';
var ICON_PIN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>';
var ICON_COPY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>';
var ICON_IG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8.8335C10.2883 8.8335 8.83337 10.2885 8.83337 12.0002C8.83337 13.7119 10.2883 15.1668 12 15.1668C13.7118 15.1668 15.1667 13.7119 15.1667 12.0002C15.1667 10.2885 13.7118 8.8335 12 8.8335Z"/><path d="M16.0591 2.5H8.02727C4.91818 2.5 2.5 4.91818 2.5 7.94091V15.9727C2.5 19.0818 4.91818 21.5 8.02727 21.5H16.0591C19.0818 21.5 21.5 19.0818 21.5 15.9727V7.94091C21.5 4.91818 19.0818 2.5 16.0591 2.5ZM12 17.0091C9.23636 17.0091 7.07727 14.7636 7.07727 12.0864C7.07727 9.40909 9.23636 7.07727 12 7.07727C14.7636 7.07727 16.9227 9.32273 16.9227 12C16.9227 14.6773 14.7636 17.0091 12 17.0091ZM17.0955 8.11364C16.4909 8.11364 15.9727 7.59545 15.9727 6.99091C15.9727 6.38636 16.4909 5.86818 17.0955 5.86818C17.7 5.86818 18.2182 6.38636 18.2182 6.99091C18.2182 7.59545 17.7 8.11364 17.0955 8.11364Z"/></svg>';
function detailBody(p){
  var post = reel.post ? reel.post : '#';
  var photo = p.img ? '<img src="'+p.img+'" alt="">' : '<span class="tile '+p.tone+'" style="display:grid;width:100%;height:100%;font-size:70px">'+p.emoji+'</span>';
  var lines = '<div class="iline"><span class="k">도로명</span><span class="v">'+esc(p.road)+'</span><button type="button" data-msg="도로명 주소가 복사되었습니다." data-copy="'+esc(p.road)+'">복사</button></div>';
  if (p.lot) lines += '<div class="iline"><span class="k">지번</span><span class="v">'+esc(p.lot)+'</span><button type="button" data-msg="지번 주소가 복사되었습니다." data-copy="'+esc(p.lot)+'">복사</button></div>';
  return '<div class="dmeta">'
    + '<div class="drow">'+ICON_TAG+'<span>'+esc(midCat(p.cat))+'</span></div>'
    + '<div class="drow addr">'+ICON_PIN+'<span>'+esc(p.road)+'</span></div>'
    + '<div class="dacts"><a class="dact kakao" href="'+p.url+'" target="_blank" rel="noopener" aria-label="카카오맵에서 보기(새 창)"><b>K</b>카카오맵</a><button type="button" class="dact copy" data-msg="도로명 주소가 복사되었습니다." data-copy="'+esc(p.road)+'">'+ICON_COPY+'주소 복사</button></div>'
    + '</div>'
    + '<div class="dphoto">'+photo+'</div>'
    + '<div class="dtabs"><button type="button" class="on" data-dtab="posts">게시물</button><button type="button" data-dtab="info">정보</button></div>'
    + '<div class="dposts"><a class="dpost" href="'+post+'" target="_blank" rel="noopener" data-post="'+(reel.post?'1':'0')+'">'+(reel.thumb ? '<div class="pt"><img src="'+reel.thumb+'" alt=""></div>' : '<div class="pt tile '+reel.tone+'">'+reel.emoji+'</div>')+'<span class="dacc">'+ICON_IG+esc(reel.author)+'</span><b class="dcap">'+esc(reel.title)+'</b></a></div>'
    + '<div class="dinfo" hidden><div class="irow"><span class="iic">'+ICON_PIN+'</span><div class="ilines">'+lines+'</div></div></div>';
}
function openDetail(p){
  if (tab==='map') openMapDetail(p); else openFullDetail(p);
}
function openFullDetail(p){
  state='detail'; mark('detail'); hideHint(); setStep(3);
  dname.textContent=p.name; dbody.innerHTML=detailBody(p);
  showScreen('detail'); btnFinish.hidden=false;
  var id=run;
  autoLater(3600, function(){ if (state==='detail') finish(); });
  if (!auto) later(2500, function(){ if (id!==run||state!=='detail') return; showHint(btnFinishIn, '다 봤으면 여기를 눌러요', 'top'); });
}
/* 지도에서는 앱처럼 바텀시트 안에서 상세가 열리고 핀이 주황색으로 바뀐다 */
function openMapDetail(p){
  state='mapDetail'; mark('detail'); hideHint(); setStep(3);
  var idx=reel.places.indexOf(p), ps=pins.querySelectorAll('.pin');
  for (var i=0;i<ps.length;i++){ var sel=(i===idx); ps[i].classList.toggle('sel', sel); ps[i].querySelector('img').src = sel ? 'assets/marker-selected.png' : 'assets/marker.png'; }
  mdetail.innerHTML='<div class="dtitle"><b>'+esc(p.name)+'</b><button type="button" class="dmore" aria-label="더 보기">⋮</button></div>'+detailBody(p);
  mlist.hidden=true; mdetail.hidden=false; msheet.classList.add('on');
  headAvatar.hidden=true; btnMapBack.hidden=false; btnFinishMap.hidden=false; btnFinish.hidden=false;
  var id=run;
  autoLater(3600, function(){ if (state==='mapDetail') finish(); });
  if (!auto) later(2500, function(){ if (id!==run||state!=='mapDetail') return; showHint(btnFinishMap, '다 봤으면 여기를 눌러요', 'bottom'); });
}
function leaveMapDetail(){
  var ps=pins.querySelectorAll('.pin'); for (var i=0;i<ps.length;i++){ ps[i].classList.remove('sel'); ps[i].querySelector('img').src='assets/marker.png'; }
  mdetail.hidden=true; mlist.hidden=false; headAvatar.hidden=false; btnMapBack.hidden=true; btnFinishMap.hidden=true;
}
function backFromMapDetail(){ if (state!=='mapDetail') return; hideHint(); leaveMapDetail(); state='map'; }
function backFromDetail(){
  if (state!=='detail') return;
  hideHint(); showScreen('app'); showTab(tab, true); state = tab==='map' ? 'map' : (tab==='lib' ? 'lib' : (tab==='history' ? 'history' : 'profile'));
}
function setDTab(box, name){
  var bs=box.querySelectorAll('.dtabs button'); for (var i=0;i<bs.length;i++) bs[i].classList.toggle('on', bs[i].dataset.dtab===name);
  box.querySelector('.dposts').hidden = name!=='posts'; box.querySelector('.dinfo').hidden = name!=='info';
}
function finish(title, text){
  hideHint(); clearTimers(); setStep(4); mark('end'); btnFinish.hidden=true;
  endTitle.textContent = title || '진짜 내 릴스로 해 보세요';
  endText.textContent = text || '저장해 둔 릴스를 여기담에 공유하면 지금처럼 지도에 담겨요.';
  endcard.hidden=false; state='end';
  if (auto){ auto=false; btnAuto.textContent='자동으로 보기'; btnAuto.classList.remove('btn-dark'); btnAuto.classList.add('btn-soft'); }
  endcard.querySelector('.ecard').scrollIntoView({block:'nearest'});
}

/* ---------- 지도 그림 ---------- */
function mapSVG(r){
  var s='<svg viewBox="0 0 360 720" preserveAspectRatio="xMidYMid slice" role="img" aria-label="지도">';
  s+='<rect width="360" height="720" fill="#f3f2ec"/>';
  for (var y=-20;y<720;y+=64) for (var x=-20;x<360;x+=62) s+='<rect x="'+(x+6)+'" y="'+(y+6)+'" width="50" height="52" rx="6" fill="#e8e6de"/>';
  s+='<ellipse cx="300" cy="420" rx="90" ry="60" fill="#cfe3cf"/>'+(r.map==='metro' ? '' : '<ellipse cx="40" cy="120" rx="50" ry="40" fill="#cfe3cf"/>');
  var roads=[[0,210,360,210],[178,0,178,720],[0,330,360,330],[90,0,90,720],[270,0,270,720],[0,80,360,80],[0,520,360,520]];
  roads.forEach(function(rd){ s+='<line x1="'+rd[0]+'" y1="'+rd[1]+'" x2="'+rd[2]+'" y2="'+rd[3]+'" stroke="#d9d6cc" stroke-width="14"/><line x1="'+rd[0]+'" y1="'+rd[1]+'" x2="'+rd[2]+'" y2="'+rd[3]+'" stroke="#ffffff" stroke-width="10"/>'; });
  if (r.map==='metro'){
    s+='<path d="M-10,52 C60,30 120,70 190,48 C260,26 310,60 370,40 L370,-10 L-10,-10 Z" fill="#b9d7f0"/>';
    s+='<path d="M-10,52 C60,30 120,70 190,48 C260,26 310,60 370,40" fill="none" stroke="#ffffff" stroke-width="6"/>';
    s+='<text x="180" y="26" font-size="12" fill="#4a6f90" font-weight="700" text-anchor="middle">한강</text>';
    s+='<text x="262" y="188" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">강남구</text>';
    s+='<text x="80" y="214" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">서초구</text>';
    s+='<text x="318" y="124" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">강동구</text>';
    s+='<text x="52" y="300" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">수원</text>';
    s+='<text x="240" y="282" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">용인</text>';
    s+='<text x="320" y="312" font-size="12" fill="#5b5b66" font-weight="700" text-anchor="middle">청주</text>';
  } else {
    s+='<path d="M310,-10 C330,120 300,260 330,400 C350,520 320,640 340,730" fill="none" stroke="#b9d7f0" stroke-width="18"/>';
    s+='<line x1="0" y1="210" x2="360" y2="210" stroke="#996cac" stroke-width="4"/><line x1="178" y1="0" x2="178" y2="720" stroke="#747f00" stroke-width="4"/>';
    s+='<circle cx="178" cy="210" r="9" fill="#fff" stroke="#1a1a2e" stroke-width="3"/>';
    s+='<rect x="146" y="226" width="64" height="20" rx="10" fill="#fff" stroke="#e5e5ea"/><text x="178" y="240" font-size="12" fill="#1a1a2e" font-weight="800" text-anchor="middle">'+esc(r.mapLabel)+'</text>';
    s+='<text x="300" y="130" font-size="13" fill="#5b5b66" font-weight="700" text-anchor="middle">중곡동</text><text x="60" y="440" font-size="13" fill="#5b5b66" font-weight="700">군자동</text><text x="300" y="424" font-size="12" fill="#4f7a4f" font-weight="700" text-anchor="middle">어린이대공원</text>';
  }
  return s+'</svg>';
}

/* ---------- 이벤트 ---------- */
$('btnShare').addEventListener('click', tapShare);
$('btnYeogidam').addEventListener('click', tapYeogidam);
scrim.addEventListener('click', closeSheet);
btnLaunch.addEventListener('click', openApp);
$('btnBack').addEventListener('click', backFromDetail);
btnMapBack.addEventListener('click', backFromMapDetail);
$('btnMore').addEventListener('click', function(){ toast('더 보기에는 삭제하기가 있어요'); });
$('btnReport').addEventListener('click', function(){ askConfirm('제보할까요?', function(){ toast('데모에서는 바로 제보 완료로 표시해요'); $('btnReport').textContent='제보 완료'; }); });
$('btnRetry').addEventListener('click', function(){ askConfirm('다시 시도할까요?', function(){ toast('데모에서는 다시 시도해도 같은 결과예요'); }); });
$('confirmNo').addEventListener('click', function(){ confirmBox.hidden=true; confirmYes=null; });
$('confirmYes').addEventListener('click', function(){ confirmBox.hidden=true; var fn=confirmYes; confirmYes=null; if (fn) fn(); });
histItem.addEventListener('click', openHistDetail);
$('btnHistBack').addEventListener('click', backFromHistDetail);
hdOrig.addEventListener('click', function(e){ if (!reel.post){ e.preventDefault(); toast('예시 릴스라 원본이 없어요'); } });
btnFinishIn.addEventListener('click', function(){ finish(); });
btnFinishMap.addEventListener('click', function(){ finish(); });
fab.addEventListener('click', function(){ toast('링크를 붙여 넣어 직접 추가할 수도 있어요'); });
screen.addEventListener('click', function(e){
  var b=e.target.closest('.reel-acts button:not(#btnShare), .apps .app-ic:not(.me), .sheet-row, .pedit, .plist div, .locbtn, .dmore, #libTools');
  if (b){ toast(b.classList.contains('dmore') ? '더 보기에는 삭제하기가 있어요' : '데모에서는 여기담 흐름만 눌러 볼 수 있어요'); return; }
  var t=e.target.closest('.dtabs button'); if (t){ setDTab(t.closest('.dtabs').parentNode, t.dataset.dtab); return; }
  var c=e.target.closest('[data-copy]');
  if (c){ var msg=c.dataset.msg, txt=c.dataset.copy; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function(){ toast(msg); }, function(){ toast(msg); }); else toast(msg); return; }
  var dp=e.target.closest('.dpost'); if (dp && dp.dataset.post==='0'){ e.preventDefault(); toast('예시 릴스라 원본이 없어요'); }
});
tabbar.addEventListener('click', function(e){
  var t=e.target.closest('.tab'); if (!t) return;
  if (!analysed && (t.dataset.tab==='lib'||t.dataset.tab==='map')){ toast('장소를 확인하는 중이에요. 잠시만요'); return; }
  if (state==='detail'){ hideHint(); showScreen('app'); }
  showTab(t.dataset.tab);
});
btnFinish.addEventListener('click', function(){ finish(); });
$('btnAgain').addEventListener('click', function(){ reset(reel); });
$('btnOther').addEventListener('click', function(){ var i=REELS.indexOf(reel); reset(REELS[(i+1)%REELS.length]); });
btnReset.addEventListener('click', function(){ reset(reel); });
btnAuto.addEventListener('click', function(){
  auto=!auto;
  btnAuto.textContent = auto ? '자동 재생 멈추기' : '자동으로 보기';
  btnAuto.classList.toggle('btn-dark', auto); btnAuto.classList.toggle('btn-soft', !auto);
  if (auto) reset(reel);
});
REELS.forEach(function(r){
  var c=document.createElement('button'); c.type='button'; c.className='chip'; c.dataset.id=r.id; c.textContent=r.chip;
  c.addEventListener('click', function(){ reset(r); phoneWrap.scrollIntoView({block:'center', behavior:'smooth'}); });
  chips.appendChild(c);
});

/* ---------- 스토어 링크 꼬리표: 랜딩에 들어온 채널을 스토어 통계에서도 나눠 보려고 Google Play 링크에 옮겨 붙인다 ---------- */
var IOS_URL='https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=landing_store&mt=8';
var PLAY_URL=(function(){
  var q=new URLSearchParams(location.search);
  var ref='utm_source='+encodeURIComponent(q.get('utm_source')||'landing')+'&utm_medium='+encodeURIComponent(q.get('utm_medium')||'web')+'&utm_campaign=landing_store';
  return 'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer='+encodeURIComponent(ref);
})();
Array.prototype.forEach.call(document.querySelectorAll('a[href*="play.google.com"]'), function(a){ a.href=PLAY_URL; });

document.addEventListener('click', function(e){
  var a=e.target.closest && e.target.closest('a[href*="apps.apple.com"], a[href*="play.google.com"]');
  if (!a) return;
  track('store_click', {store: a.href.indexOf('apps.apple.com')>-1 ? 'app_store' : 'google_play', placement: placementOf(a), demo_progress: furthest});
});

if (window.ResizeObserver) new ResizeObserver(fit).observe(phoneWrap.parentNode);
window.addEventListener('resize', fit);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
fit();
window.addEventListener('resize', function(){ if (hintTarget) showHint(hintTarget, hintText.textContent, hint.classList.contains('left')?'left':(hint.classList.contains('bottom')?'bottom':'top')); });
reset(REELS[0]);

/* ---------- QR (데스크톱에서만 라이브러리를 뒤늦게 불러온다) ---------- */
function makeQR(){
  try {
    if (typeof qrcode !== 'function') return;
    var make=function(el, url){ var q=qrcode(0,'M'); q.addData(url); q.make(); el.innerHTML=q.createSvgTag({cellSize:3, margin:0, scalable:true}); };
    make($('qrIos'), IOS_URL);
    make($('qrAndroid'), PLAY_URL);
    $('qrRow').classList.add('ready');
  } catch (e) {}
}
if (window.matchMedia && window.matchMedia('(min-width:900px)').matches){
  var qs=document.createElement('script');
  qs.src='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  qs.async=true; qs.onload=makeQR;
  document.head.appendChild(qs);
}
/* ---------- 기술 섹션: 예시 릴스에서 캡션, 자막, 컵 글자를 차례로 읽고 카카오 지도 결과를 띄운다 ---------- */
var techStage = $('techStage');
if (techStage){
  var T_STEPS = [
    {s:'캡션 읽는 중', lens:'at-cap', tag:'가게 이름 없음', miss:true, ms:2400},
    {s:'자막 읽는 중', lens:'at-sub', tag:'군자역', ms:2200},
    {s:'화면 속 글자 읽는 중', lens:'at-cup', tag:'윤숲', ms:2400},
    {s:'카카오 지도에서 확인 중', found:'load', ms:1300},
    {s:'1곳을 찾았어요', found:'done', done:true, ms:3800}
  ];
  var tStatus = techStage.querySelector('.tx-status'), tText = tStatus.querySelector('.tx-txt');
  var tLens = techStage.querySelector('.tx-lens'), tTag = tLens.querySelector('.tx-tag');
  var tIndex = 0, tTimer = null, tLater = [], tRunning = false, tPos = 'at-cup';
  var tAfter = function(fn, ms){ tLater.push(setTimeout(fn, ms)); };
  var tApply = function(k){
    var st = T_STEPS[k];
    if (st.lens){
      tPos = st.lens;
      tLens.className = 'tx-lens on moving ' + tPos;
      tAfter(function(){ tTag.textContent = st.tag; tTag.classList.toggle('miss', !!st.miss); }, 260);
      tAfter(function(){ tLens.classList.remove('moving'); }, 720);
    } else {
      tLens.className = 'tx-lens ' + tPos;
    }
    if (st.found) techStage.setAttribute('data-found', st.found); else techStage.removeAttribute('data-found');
    tStatus.classList.toggle('done', !!st.done);
    tText.classList.add('swap');
    tAfter(function(){ tText.textContent = st.s; tText.classList.remove('swap'); }, 200);
  };
  var tTick = function(){
    tApply(tIndex);
    tTimer = setTimeout(function(){ tIndex = (tIndex + 1) % T_STEPS.length; tTick(); }, T_STEPS[tIndex].ms);
  };
  // 움직임 줄이기 설정이거나 IntersectionObserver가 없으면 마크업에 둔 마지막 장면(찾은 결과)에 멈춘다
  var tStart = function(){ if (tRunning || reduce) return; tRunning = true; tIndex = 0; tTick(); };
  var tStop = function(){ tRunning = false; clearTimeout(tTimer); tLater.forEach(clearTimeout); tLater = []; };
  var tSeen = false;
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(es){
      es.forEach(function(e){
        if (e.isIntersecting){
          // 기술 섹션까지 내려온 방문자를 세려고, 페이지를 한 번 열 때 한 번만 보낸다
          if (!tSeen){ tSeen = true; track('tech_view'); }
          tStart();
        } else tStop();
      });
    }, {threshold:.3}).observe(techStage);
  }
  var tHow = document.querySelector('.tx-how'), tHowSent = false;
  if (tHow) tHow.addEventListener('toggle', function(){
    if (tHow.open && !tHowSent){ tHowSent = true; track('tech_method_open'); }
  });
}
/* ---------- 품질을 다듬는 방법: 섹션까지 내려온 방문자와 버전 내용을 처음 본 방문자를 센다 ---------- */
var journey = $('journey');
if (journey){
  if ('IntersectionObserver' in window){
    var jObserver = new IntersectionObserver(function(es){
      // 페이지를 한 번 열 때 한 번만 보낸다
      if (es.some(function(e){ return e.isIntersecting; })){ track('journey_view'); jObserver.disconnect(); }
    }, {threshold:.3});
    jObserver.observe(journey);
  }
  // 버전 내용을 처음 본 방문자를 페이지마다 한 번 센다. 마우스는 0.5초 넘게 올려 둔 때만 센다
  var jOpenSent = false;
  var jSeen = function(v){
    if (jOpenSent) return;
    jOpenSent = true;
    track('journey_version_open', {version: v});
  };

  // 마우스를 올리거나 누른 버전 번호의 내용을 보여 주고, 키보드는 왼쪽과 오른쪽 화살표로 옮긴다
  var jTabs = [].slice.call(journey.querySelectorAll('.jr-tab'));
  var jSelect = function(tab, focus){
    jTabs.forEach(function(t){
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).classList.toggle('on', on);
    });
    if (focus) tab.focus();
  };
  jTabs.forEach(function(tab, i){
    var hoverTimer;
    tab.addEventListener('click', function(){ jSelect(tab); jSeen(tab.getAttribute('data-v')); });
    tab.addEventListener('mouseenter', function(){
      jSelect(tab);
      hoverTimer = setTimeout(function(){ jSeen(tab.getAttribute('data-v')); }, 500);
    });
    tab.addEventListener('mouseleave', function(){ clearTimeout(hoverTimer); });
    tab.addEventListener('keydown', function(e){
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      jSelect(jTabs[(i + step + jTabs.length) % jTabs.length], true);
    });
  });
}
