import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {AuthScaffold} from './components/AuthScaffold';
import {AuthTextField} from './components/AuthTextField';

type EmailLoginScreenProps = {
  onBack: () => void;
  onOpenSignup: () => void;
  onOpenTerms: () => void;
  onLogin: () => void;
};

export function EmailLoginScreen({
  onBack,
  onOpenSignup,
  onOpenTerms,
  onLogin,
}: EmailLoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <AuthScaffold
      description="이메일로 로그인하고 저장한 장소를 이어서 관리해보세요."
      onBack={onBack}
      title="이메일 로그인"
      contentStyle={styles.content}>
      <View style={styles.form}>
        <AuthTextField
          autoCapitalize="none"
          keyboardType="email-address"
          label="이메일"
          onChangeText={setEmail}
          placeholder="hello@yeogidam.app"
          value={email}
        />
        <AuthTextField
          label="비밀번호"
          onChangeText={setPassword}
          placeholder="비밀번호를 입력하세요"
          secureTextEntry
          value={password}
        />
      </View>

      <Pressable
        onPress={onLogin}
        style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>로그인</Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>계정이 없으신가요?</Text>
        <Pressable hitSlop={8} onPress={onOpenSignup}>
          <Text style={styles.footerLink}>회원가입</Text>
        </Pressable>
        <Text style={styles.footerDivider}>|</Text>
        <Pressable hitSlop={8} onPress={onOpenTerms}>
          <Text style={styles.footerLink}>약관 동의</Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    marginTop: 48,
  },
  form: {
    gap: 16,
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#ffffff',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  footerText: {
    fontSize: 14,
    color: '#7d7d84',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#121212',
  },
  footerDivider: {
    fontSize: 14,
    color: '#d1d1d6',
  },
  pressed: {
    opacity: 0.8,
  },
});
