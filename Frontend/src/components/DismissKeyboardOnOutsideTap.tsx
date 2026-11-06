import React, { useRef } from 'react';
import {
  Keyboard,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';

// 다른 입력창을 눌렀을 때 포커스가 옮겨갔는지 확인하기까지 기다리는 시간입니다.
const FOCUS_SETTLE_MS = 100;
// 이보다 많이 움직인 터치는 스크롤·스와이프로 보고 키보드를 내리지 않습니다.
const TAP_SLOP = 10;

type TouchStart = {
  target: unknown;
  focused: unknown;
  pageX: number;
  pageY: number;
};

// 입력창에 커서가 있는 상태에서 화면의 다른 곳을 탭하면 키보드를 내립니다.
// onTouchStart/onTouchEnd는 응답자(responder)를 가져가지 않으므로 버튼·목록 등
// 하위 컴포넌트의 터치 동작은 그대로 실행됩니다. 모달 안의 터치도 React 트리를 따라
// 여기까지 전달되므로 앱 최상단에 한 번만 두면 됩니다.
export function DismissKeyboardOnOutsideTap({
  children,
}: {
  children: React.ReactNode;
}) {
  const touchStart = useRef<TouchStart | null>(null);

  const handleTouchStart = (event: GestureResponderEvent) => {
    const focused = TextInput.State.currentlyFocusedInput();
    touchStart.current =
      focused && event.nativeEvent.touches.length <= 1
        ? {
            target: event.target,
            focused,
            pageX: event.nativeEvent.pageX,
            pageY: event.nativeEvent.pageY,
          }
        : null;
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    // 지금 입력 중인 입력창 자체를 누른 경우(커서 이동 등)는 그대로 둡니다.
    if (!start || start.target === start.focused) return;
    const moved =
      Math.abs(event.nativeEvent.pageX - start.pageX) > TAP_SLOP ||
      Math.abs(event.nativeEvent.pageY - start.pageY) > TAP_SLOP;
    if (moved) return;
    setTimeout(() => {
      // 다른 입력창을 눌러 포커스가 옮겨갔다면 키보드를 유지합니다.
      if (TextInput.State.currentlyFocusedInput() === start.focused) {
        Keyboard.dismiss();
      }
    }, FOCUS_SETTLE_MS);
  };

  return (
    <View
      onTouchCancel={() => {
        touchStart.current = null;
      }}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      style={styles.container}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
