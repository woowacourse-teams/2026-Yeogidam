import React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppModal } from '../../../components/AppModal';

type SavedPlacesLinkDialogProps = {
  visible: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  /** 입력창이 완전히 닫힌 뒤 불립니다. iOS에서만 불러요. */
  onDismiss?: () => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  submitLabel?: string;
};

export function SavedPlacesLinkDialog({
  visible,
  value,
  onChangeValue,
  onClose,
  onSubmit,
  onDismiss,
  isSubmitting = false,
  errorMessage = null,
  submitLabel = '저장',
}: SavedPlacesLinkDialogProps) {
  const handleBackdropPress = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };

  return (
    <AppModal
      avoidKeyboard
      backdropColor="rgba(0, 0, 0, 0.35)"
      animationType="fade"
      transparent
      visible={visible}
      onDismiss={onDismiss}
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} onPress={handleBackdropPress} style={StyleSheet.absoluteFill} />
        <View style={styles.dialog}>
          <Text style={styles.title}>링크 입력</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              // VoiceOver의 두 손가락 문지르기(Z) 제스처로 키보드를 내립니다. 빈 곳 탭은 스크린 리더에서 쓸 수 없어요.
              onAccessibilityEscape={Keyboard.dismiss}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={inputValue => onChangeValue(inputValue)}
              placeholder="URL을 붙여넣으세요"
              placeholderTextColor="#b7b7bd"
              style={styles.input}
              value={value}
            />
            <Pressable hitSlop={8} onPress={() => onChangeValue('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          </View>
          {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
          <View style={styles.actions}>
            <Pressable disabled={isSubmitting} hitSlop={8} onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable disabled={isSubmitting} onPress={onSubmit} style={styles.confirmButton}>
              {isSubmitting ? <ActivityIndicator color="#23232d" /> : <Text style={styles.confirmText}>{submitLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    borderRadius: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#24243a',
  },
  inputWrapper: {
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7d7dc',
    backgroundColor: '#f8f8fb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#1f1f24',
    paddingVertical: 0,
  },
  errorMessage: {
    marginTop: 8,
    color: '#d65b73',
    fontSize: 12,
    lineHeight: 17,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e2e2e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    lineHeight: 16,
    color: '#8a8a94',
    fontWeight: '500',
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d4dbff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#23232d',
  },
  confirmButton: {
    flex: 1.45,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d4dbff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#23232d',
  },
});
