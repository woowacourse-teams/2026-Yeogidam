import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

type SavedPlacesEmptyStateProps = {
  isGuest?: boolean;
  onLogin?: () => void;
};

export function SavedPlacesEmptyState({
  isGuest = false,
  onLogin,
}: SavedPlacesEmptyStateProps) {
  return (
    <View style={styles.content}>
      <Image
        source={require('../../../assets/illustrations/dami-empty-box-small-cropped.png')}
        style={styles.image}
      />
      <Text style={styles.title}>아직 저장된 장소가 없어요</Text>
      <Text style={styles.description}>
        {isGuest ? (
          <>
            로그인하고 마음에 드는 장소를{'\n'}
            나만의 보관함에 담아보세요.
          </>
        ) : (
          <>
            인스타그램 릴스를 공유하고{'\n'}
            마음에 드는 장소를 나만의 보관함에 담아보세요.
          </>
        )}
      </Text>
      {isGuest ? (
        <Pressable
          accessibilityLabel="보관함 로그인"
          accessibilityRole="button"
          onPress={onLogin}
          style={({pressed}) => [
            styles.loginButton,
            pressed && styles.loginButtonPressed,
          ]}>
          <Text style={styles.loginButtonText}>로그인하기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
    paddingHorizontal: 24,
  },
  image: {
    width: 250,
    height: 183,
    transform: [{translateX: -16}],
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  description: {
    fontSize: 14,
    color: '#8e8e93',
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 8,
  },
  loginButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1F2238',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginButtonPressed: {
    opacity: 0.82,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
