import React, { useCallback } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type AppUpdateModalProps = {
  storeUrl: string;
  visible: boolean;
} & (
  | {mode: 'required'; onDismiss?: never}
  | {mode: 'recommended'; onDismiss: () => void}
);

export function AppUpdateModal(props: AppUpdateModalProps) {
  const {storeUrl, visible} = props;
  const required = props.mode === 'required';
  const openStore = useCallback(() => {
    Linking.openURL(storeUrl).catch(error => {
      if (__DEV__) {
        console.warn('[AppUpdatePolicy] Unable to open store URL.', error);
      }
    });
  }, [storeUrl]);
  const dismiss = () => {
    if (props.mode === 'recommended') props.onDismiss();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text style={styles.title}>
            {required ? '앱 업데이트가 필요해요' : '새 버전이 나왔어요'}
          </Text>
          <Text style={styles.message}>
            {required ? (
              <>
                현재 버전에서는 서비스를 계속{`\n`}이용할 수 없습니다.{`\n`}최신
                버전으로 업데이트해 주세요.
              </>
            ) : (
              '최신 버전으로 업데이트하고 여기담을 이용해 보세요.'
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openStore}
            style={({ pressed }) => [
              styles.updateButton,
              pressed && styles.updateButtonPressed,
            ]}
          >
            <Text style={styles.updateButtonText}>지금 업데이트</Text>
          </Pressable>
          {!required && (
            <Pressable
              accessibilityRole="button"
              onPress={dismiss}
              style={styles.dismissButton}
            >
              <Text style={styles.dismissButtonText}>나중에</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  dialog: {
    backgroundColor: '#F7F7F8',
    borderRadius: 30,
    maxWidth: 320,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    width: '100%',
  },
  title: {
    color: '#171719',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  message: {
    color: '#171719',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: -0.35,
    lineHeight: 22,
    marginTop: 8,
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: '#0A84FF',
    borderRadius: 26,
    height: 49,
    justifyContent: 'center',
    marginTop: 24,
  },
  updateButtonPressed: {
    opacity: 0.8,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  dismissButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginTop: 8,
  },
  dismissButtonText: {
    color: '#5A5A5F',
    fontSize: 15,
    fontWeight: '500',
  },
});
