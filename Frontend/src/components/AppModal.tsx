import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  type ModalProps,
  StyleSheet,
  View,
} from 'react-native';

import { markModalOpened } from './modalPresence';

type AppModalProps = ModalProps & {
  // 입력창이 있는 모달에서 켭니다. 키보드가 올라오면 내용이 키보드 위로 밀려 올라갑니다.
  // iOS 모달은 키보드에 맞춰 줄어들지 않습니다. Android도 targetSdk 35+에서는 15·16 기기가
  // edge-to-edge를 강제해 adjustResize가 창을 줄이지 않으므로, 두 플랫폼 모두 padding으로 밀어 올립니다.
  avoidKeyboard?: boolean;
  backdropColor?: string;
};

// 앱의 모든 모달은 react-native의 Modal 대신 이 컴포넌트를 씁니다.
// 열려 있는 동안에는 화면 왼쪽 가장자리의 뒤로가기 제스처가 모달 터치를 가져가지 않습니다.
export function AppModal({
  avoidKeyboard = false,
  backdropColor,
  children,
  ...modalProps
}: AppModalProps) {
  const isOpen = modalProps.visible !== false;
  useEffect(() => (isOpen ? markModalOpened() : undefined), [isOpen]);

  return (
    <Modal {...modalProps}>
      {avoidKeyboard ? (
        <View style={[styles.container, { backgroundColor: backdropColor }]}>
          <KeyboardAvoidingView behavior="padding" style={styles.container}>
            {children}
          </KeyboardAvoidingView>
        </View>
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
