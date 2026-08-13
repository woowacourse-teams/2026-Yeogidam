import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type SavedPlacesLinkDialogProps = {
  visible: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
};

export function SavedPlacesLinkDialog({
  visible,
  value,
  onChangeValue,
  onClose,
  onSubmit,
  isSubmitting = false,
}: SavedPlacesLinkDialogProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>링크 입력</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={onChangeValue}
              placeholder="URL을 붙여넣으세요"
              placeholderTextColor="#b7b7bd"
              style={styles.input}
              value={value}
            />
            <Pressable hitSlop={8} onPress={() => onChangeValue('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>×</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable disabled={isSubmitting} hitSlop={8} onPress={onClose} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable disabled={isSubmitting} onPress={onSubmit} style={styles.confirmButton}>
              {isSubmitting ? <ActivityIndicator color="#23232d" /> : <Text style={styles.confirmText}>저장</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
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
    justifyContent: 'space-between',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#d4dbff',
  },
  confirmButton: {
    minWidth: 72,
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
