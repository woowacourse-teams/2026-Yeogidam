import React from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

type LoginScreenProps = {
  onBack: () => void;
};

const socialButtons = [
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
    label: 'Gmail로 계속하기',
    imageSource: require('../../assets/icons/google-logo.jpg'),
    variant: 'gmail' as const,
  },
];

const footerLinks = ['회원가입', '로그인', '문의하기'];

export function LoginScreen({onBack}: LoginScreenProps) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Pressable hitSlop={12} onPress={onBack} style={styles.closeButton}>
        <MaterialIcons color="#121212" name="close" size={34} />
      </Pressable>

      <View style={styles.main}>
        <View style={styles.brandSection}>
          <View style={styles.logoTile}>
            <Image
              source={require('../../assets/illustrations/empty-illustration.png')}
              style={styles.logoImage}
            />
          </View>
        </View>

        <View style={styles.buttonList}>
          {socialButtons.map(button => (
            <Pressable
              key={button.label}
              style={({pressed}) => [
                styles.socialButton,
                styles[`${button.variant}Button`],
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
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.linkRow}>
            {footerLinks.map((label, index) => (
              <React.Fragment key={label}>
                {index > 0 ? <Text style={styles.linkDivider}>|</Text> : null}
                <Pressable hitSlop={8}>
                  <Text style={styles.linkText}>{label}</Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 32,
  },
  closeButton: {
    alignSelf: 'flex-start',
    marginLeft: -6,
  },
  main: {
    flex: 1,
    paddingTop: 28,
  },
  brandSection: {
    alignItems: 'center',
    marginTop: 56,
  },
  logoTile: {
    width: 156,
    height: 156,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  brandText: {
    marginTop: 20,
    fontSize: 34,
    fontWeight: '900',
    color: '#ff4fa3',
    letterSpacing: -1,
  },
  promoBubble: {
    alignSelf: 'center',
    marginTop: 28,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 26,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 5,
  },
  promoText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: '#353535',
  },
  promoPointer: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 16,
    backgroundColor: '#ffffff',
    transform: [{rotate: '45deg'}],
  },
  buttonList: {
    gap: 14,
    marginTop: 96,
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
  gmailButton: {
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
  gmailIconWrap: {
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
  gmailLabel: {
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
});
