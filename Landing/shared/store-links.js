// 스토어 링크: 랜딩에 들어온 채널을 스토어 통계에서도 나눠 보려고 Google Play 링크에 꼬리표를 옮겨 붙이고,
// 스토어 버튼을 누른 자리를 GA에 남기며, 데스크톱에서는 QR 코드를 그린다
import { track } from './analytics.js';

export var IOS_URL='https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=landing_store&mt=8';
var QR_LIBRARY_URL='https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

// 랜딩 주소의 utm_source와 utm_medium을 Google Play referrer로 옮긴다. 없으면 랜딩에서 바로 온 방문으로 본다
export function playUrl(search){
  var q=new URLSearchParams(search);
  var ref='utm_source='+encodeURIComponent(q.get('utm_source')||'landing')+'&utm_medium='+encodeURIComponent(q.get('utm_medium')||'web')+'&utm_campaign=landing_store';
  return 'https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer='+encodeURIComponent(ref);
}

export function tagPlayLinks(url){
  Array.prototype.forEach.call(document.querySelectorAll('a[href*="play.google.com"]'), function(a){ a.href=url; });
}

function placementOf(a){
  if (a.closest('#endcard')) return 'demo_end';
  if (a.closest('.hero')) return 'hero';
  if (a.closest('#start')) return 'start';
  if (a.closest('.foot')) return 'footer';
  return 'other';
}

// demoProgress는 방문자가 데모를 어느 단계까지 봤는지 돌려준다
export function trackStoreClicks(demoProgress){
  document.addEventListener('click', function(e){
    var a=e.target.closest && e.target.closest('a[href*="apps.apple.com"], a[href*="play.google.com"]');
    if (!a) return;
    track('store_click', {store: a.href.indexOf('apps.apple.com')>-1 ? 'app_store' : 'google_play', placement: placementOf(a), demo_progress: demoProgress()});
  });
}

// QR 코드는 데스크톱에서만 보이므로 라이브러리를 그때만 뒤늦게 불러온다
export function loadQrCodes(androidUrl){
  if (!(window.matchMedia && window.matchMedia('(min-width:900px)').matches)) return;
  var qs=document.createElement('script');
  qs.src=QR_LIBRARY_URL;
  qs.async=true; qs.onload=function(){ makeQR(androidUrl); };
  document.head.appendChild(qs);
}

function makeQR(androidUrl){
  try {
    if (typeof qrcode !== 'function') return;
    var make=function(el, url){ var q=qrcode(0,'M'); q.addData(url); q.make(); el.innerHTML=q.createSvgTag({cellSize:3, margin:0, scalable:true}); };
    make(document.getElementById('qrIos'), IOS_URL);
    make(document.getElementById('qrAndroid'), androidUrl);
    document.getElementById('qrRow').classList.add('ready');
  } catch (e) {}
}
