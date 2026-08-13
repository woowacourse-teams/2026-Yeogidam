import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {AuthScaffold} from './components/AuthScaffold';
import type {NormalizedAuthError} from '../../lib/auth/errors';

type LoginScreenProps = {
  onOpenSignup: () => void;
  onOpenEmailLogin: () => void;
  onContinueWithKakao: () => void;
  onContinueWithGoogle: () => void;
  socialLoginError: NormalizedAuthError | null;
  pendingSocialProvider: 'kakao' | 'google' | null;
};

type SocialButton =
  | {
      label: string;
      imageSource: ReturnType<typeof require>;
      variant: 'kakao' | 'google';
    }
  | {
      label: string;
      icon: 'apple';
      variant: 'apple';
    };

const socialButtons: SocialButton[] = [
  {
    label: '카카오로 계속하기',
    imageSource: require('../../assets/icons/kakao-logo.png'),
    variant: 'kakao' as const,
  },
  {
    label: 'Apple로 계속하기',
    icon: 'apple',
    variant: 'apple' as const,
  },
  {
    label: 'Google로 계속하기',
    imageSource: require('../../assets/icons/google-logo.jpg'),
    variant: 'google' as const,
  },
];

const footerLinks = ['회원가입', '로그인', '문의하기'] as const;
type FooterLink = (typeof footerLinks)[number];

export function LoginScreen({
  onOpenSignup,
  onOpenEmailLogin,
  onContinueWithKakao,
  onContinueWithGoogle,
  socialLoginError,
  pendingSocialProvider,
}: LoginScreenProps) {
  const isSocialLoginPending = pendingSocialProvider !== null;
  const footerLinkActions: Record<FooterLink, () => void> = {
    회원가입: onOpenSignup,
    로그인: onOpenEmailLogin,
    문의하기: () => {},
  };
  const socialButtonActions = {
    kakao: onContinueWithKakao,
    google: onContinueWithGoogle,
  } as const;

  return (
    <AuthScaffold contentStyle={styles.main}>
      <View style={styles.buttonList}>
        {socialButtons.map(button => (
          <Pressable
            key={button.label}
            disabled={
              button.variant === 'apple' ? true : isSocialLoginPending
            }
            onPress={
              button.variant === 'apple'
                ? undefined
                : socialButtonActions[button.variant]
            }
            style={({pressed}) => [
              styles.socialButton,
              styles[`${button.variant}Button`],
              (button.variant === 'apple' || isSocialLoginPending) &&
                styles.disabledButton,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.iconWrap, styles[`${button.variant}IconWrap`]]}>
              {'imageSource' in button ? (
                <Image source={button.imageSource} style={styles.socialIconImage} />
              ) : (
                <MaterialIcons color="#121212" name={button.icon} size={24} />
              )}
            </View>
            <Text style={[styles.socialLabel, styles[`${button.variant}Label`]]}>
              {button.label}
            </Text>
            {button.variant === pendingSocialProvider ? (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator color="#191919" size="small" />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {socialLoginError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorMessage}>{socialLoginError.message}</Text>
          {socialLoginError.retryable ? (
            <Text style={styles.retryMessage}>로그인 버튼을 다시 눌러 재시도해주세요.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.linkRow}>
          {footerLinks.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 ? <Text style={styles.linkDivider}>|</Text> : null}
              <Pressable hitSlop={8} onPress={footerLinkActions[label]}>
                <Text style={styles.linkText}>{label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  main: {
    marginTop: 96,
  },
  buttonList: {
    gap: 14,
  },
  socialButton: {
    height: 54,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 16,
  },
  kakaoButton: {
    backgroundColor: '#fee500',
  },
  appleButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  googleButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  iconWrap: {
    position: 'absolute',
    left: 20,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialIconImage: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  kakaoIconWrap: {
    backgroundColor: 'transparent',
  },
  appleIconWrap: {
    backgroundColor: 'transparent',
  },
  googleIconWrap: {
    backgroundColor: 'transparent',
  },
  socialLabel: {
    fontSize: 18,
    fontWeight: '500',
  },
  kakaoLabel: {
    color: '#191919',
  },
  appleLabel: {
    color: '#121212',
  },
  googleLabel: {
    color: '#121212',
  },
  footer: {
    alignItems: 'center',
    marginTop: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  linkDivider: {
    fontSize: 15,
    color: '#d1d1d6',
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  pressed: {
    opacity: 0.78,
  },
  disabledButton: {
    opacity: 0.45,
  },
  loadingIndicator: {
    position: 'absolute',
    right: 20,
  },
  errorBox: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: '#fff7ed',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  errorMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9a3412',
  },
  retryMessage: {
    fontSize: 13,
    lineHeight: 18,
    color: '#c2410c',
  },
});
