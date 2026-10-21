import React, {useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {SavedPlacesGuideNotice} from './SavedPlacesGuideNotice';

type SavedPlacesEmptyStateProps = {
  isGuest?: boolean;
  onLogin?: () => void;
  onOpenGuide?: () => void;
};

export function SavedPlacesEmptyState({
  isGuest = false,
  onLogin,
  onOpenGuide,
}: SavedPlacesEmptyStateProps) {
  const [guideTopOffset, setGuideTopOffset] = useState<number | null>(null);

  const positionGuideAfter = (
    event: {nativeEvent: {layout: {y: number; height: number}}},
    gap: number,
  ) => {
    setGuideTopOffset(event.nativeEvent.layout.y + event.nativeEvent.layout.height + gap);
  };

  return (
    <View style={styles.content}>
      <Image
        source={require('../../../assets/illustrations/dami-empty-box-small-cropped.png')}
        style={styles.image}
      />
      <Text style={styles.title}>아직 저장된 장소가 없어요</Text>
      <Text
        testID="saved-places-empty-description"
        onLayout={
          isGuest
            ? undefined
            : event => positionGuideAfter(event, 24)
        }
        style={styles.description}>
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
          onLayout={event => positionGuideAfter(event, 12)}
          style={({pressed}) => [
            styles.loginButton,
            pressed && styles.loginButtonPressed,
          ]}>
          <Text style={styles.loginButtonText}>로그인하기</Text>
        </Pressable>
      ) : null}
      {guideTopOffset !== null && onOpenGuide ? (
        <SavedPlacesGuideNotice
          topOffset={guideTopOffset}
          onOpenGuide={onOpenGuide}
        />
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
    position: 'relative',
    transform: [{translateY: -20}],
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
    lineHeight: 22.4,
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
