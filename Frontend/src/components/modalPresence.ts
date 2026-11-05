// 지금 열려 있는 KeyboardAvoidingModal 수를 셉니다.
// RN의 터치 응답자는 화면 위치가 아니라 React 트리를 따라 정해지므로, 모달 안의 터치도
// 화면을 감싼 SwipeBackStack의 capture 핸들러를 거칩니다. 모달이 열려 있는 동안에는
// 뒤로가기 제스처가 모달의 터치를 가져가지 않도록 이 값으로 막습니다.
let openModalCount = 0;

export function markModalOpened(): () => void {
  openModalCount += 1;
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    openModalCount -= 1;
  };
}

export function isAnyModalOpen(): boolean {
  return openModalCount > 0;
}
