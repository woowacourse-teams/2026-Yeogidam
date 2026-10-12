import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

type GuestLoginPromptProps = {
  visible: boolean;
  onLogin: () => void;
  onContinueBrowsing: () => void;
};

export function GuestLoginPrompt({
  visible,
  onLogin,
  onContinueBrowsing,
}: GuestLoginPromptProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onContinueBrowsing}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text style={styles.title}>둘러보니 어떠셨나요?</Text>
          <Text style={styles.message}>
            로그인하고 마음에 드는 장소를 내 보관함에 담아보세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onLogin}
            style={({pressed}) => [styles.loginButton, pressed && styles.pressed]}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onContinueBrowsing}
            style={({pressed}) => [styles.continueButton, pressed && styles.pressed]}>
            <Text style={styles.continueButtonText}>계속 둘러보기</Text>
          </Pressable>
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    maxWidth: 320,
    padding: 24,
    width: '100%',
  },
  title: {
    color: '#1f2238',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  message: {
    color: '#596275',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: '#1f2238',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 50,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  continueButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  continueButtonText: {
    color: '#596275',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
