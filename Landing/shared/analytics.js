// GA4로 이벤트를 보낸다. 방문 통계가 실패해도 페이지 동작은 이어져야 하므로 오류를 밖으로 내지 않는다
export function track(name, params) {
  try {
    if (typeof gtag === 'function') gtag('event', name, params);
  } catch (e) {}
}
