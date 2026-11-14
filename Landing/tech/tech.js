// 기술 섹션: 예시 릴스에서 캡션, 자막, 컵 글자를 차례로 읽고 카카오 지도 결과를 띄운다
import { track } from '../shared/analytics.js';
import { reduceMotion as reduce } from '../shared/motion.js';

export function initTech() {
  var techStage = document.getElementById('techStage');
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
}
