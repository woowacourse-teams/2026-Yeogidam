import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { markModalOpened } from './modalPresence';

type AppModalProps = ModalProps & {
  // 입력창이 있는 모달에서 켭니다. 키보드가 올라오면 내용이 키보드 위로 밀려 올라갑니다.
  // iOS는 모달이 키보드에 맞춰 줄어들지 않아 padding으로 밀어 올리고,
  // Android는 모달 창이 adjustResize로 직접 줄어들기 때문에 따로 처리하지 않습니다.
  avoidKeyboard?: boolean;
};

// 앱의 모든 모달은 react-native의 Modal 대신 이 컴포넌트를 씁니다.
// 열려 있는 동안에는 화면 왼쪽 가장자리의 뒤로가기 제스처가 모달 터치를 가져가지 않습니다.
export function AppModal({
  avoidKeyboard = false,
  children,
  ...modalProps
}: AppModalProps) {
  const isOpen = modalProps.visible !== false;
  useEffect(() => (isOpen ? markModalOpened() : undefined), [isOpen]);

  return (
    <Modal {...modalProps}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          {children}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.container}>{children}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
