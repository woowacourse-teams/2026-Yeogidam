import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

type CopyToastProps = {
  visible: boolean;
  message: string;
  onClose: () => void;
};

export function CopyToast({ visible, message, onClose }: CopyToastProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.toast}>
          <Text style={styles.text}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 118,
  },
  toast: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1B1B1B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
