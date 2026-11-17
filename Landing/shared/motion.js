// 방문자가 기기에서 움직임 줄이기를 켰는지. 데모의 카드 차례 등장과 기술 섹션 장면 넘기기가 함께 따른다
export const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
