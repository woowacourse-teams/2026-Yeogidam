// 품질 섹션: 섹션까지 내려온 방문자와 버전 내용을 처음 본 방문자를 세고, 버전 번호로 아래 내용을 바꾼다
import { track } from '../shared/analytics.js';

export function initJourney() {
  var journey = document.getElementById('journey');
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
        document.getElementById(t.getAttribute('aria-controls')).classList.toggle('on', on);
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
}
