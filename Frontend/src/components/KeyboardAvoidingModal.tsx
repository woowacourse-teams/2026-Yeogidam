import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  Platform,
  StyleSheet,
} from 'react-native';

import { markModalOpened } from './modalPresence';

// 키보드가 올라오면 모달 내용이 키보드 위로 밀려 올라가도록 감싼 Modal입니다.
// 앱의 모든 모달은 react-native의 Modal 대신 이 컴포넌트를 씁니다.
// iOS는 모달이 키보드에 맞춰 줄어들지 않아 padding으로 밀어 올리고,
// Android는 모달 창이 adjustResize로 직접 줄어들기 때문에 따로 처리하지 않습니다.
// 열려 있는 동안에는 화면 왼쪽 가장자리의 뒤로가기 제스처가 모달 터치를 가져가지 않습니다.
export function KeyboardAvoidingModal({ children, ...modalProps }: ModalProps) {
  const isOpen = modalProps.visible !== false;
  useEffect(() => (isOpen ? markModalOpened() : undefined), [isOpen]);

  return (
    <Modal {...modalProps}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
