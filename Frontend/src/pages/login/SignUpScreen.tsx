import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {AuthScaffold} from './components/AuthScaffold';
import {AuthTextField} from './components/AuthTextField';

type SignUpScreenProps = {
  onBack: () => void;
  onOpenEmailLogin: () => void;
};

export function SignUpScreen({
  onBack,
  onOpenEmailLogin,
}: SignUpScreenProps) {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <AuthScaffold
      description="여기담 계정을 만들고 나만의 장소 컬렉션을 시작해보세요."
      onBack={onBack}
      title="회원가입"
      contentStyle={styles.content}>
      <View style={styles.form}>
        <AuthTextField
          label="닉네임"
          onChangeText={setNickname}
          placeholder="사용할 닉네임을 입력하세요"
          value={nickname}
        />
        <AuthTextField
          autoCapitalize="none"
          keyboardType="email-address"
          label="이메일"
          onChangeText={setEmail}
          placeholder="hello@yeogidam.app"
          value={email}
        />
        <AuthTextField
          helperText="영문, 숫자 포함 8자 이상"
          label="비밀번호"
          onChangeText={setPassword}
          placeholder="비밀번호를 입력하세요"
          secureTextEntry
          value={password}
        />
        <AuthTextField
          label="비밀번호 확인"
          onChangeText={setConfirmPassword}
          placeholder="비밀번호를 다시 입력하세요"
          secureTextEntry
          value={confirmPassword}
        />
      </View>

      <Pressable style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
        <Text style={styles.primaryButtonText}>회원가입</Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>이미 계정이 있으신가요?</Text>
        <Pressable hitSlop={8} onPress={onOpenEmailLogin}>
          <Text style={styles.footerLink}>로그인</Text>
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
  pressed: {
    opacity: 0.8,
  },
});
