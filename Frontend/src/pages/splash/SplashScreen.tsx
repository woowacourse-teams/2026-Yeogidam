import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {SafeAreaView} from 'react-native-safe-area-context';

export function SplashScreen() {
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(26)).current;
  const titleFloat = useRef(new Animated.Value(0)).current;
  const gifFloat = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.96)).current;
  const sparkleDrift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const introAnimation = Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 720,
        useNativeDriver: true,
      }),
      Animated.spring(contentTranslateY, {
        toValue: 0,
        friction: 7,
        tension: 54,
        useNativeDriver: true,
      }),
    ]);

    const titleFloatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(titleFloat, {
          toValue: -8,
          duration: 1350,
          useNativeDriver: true,
        }),
        Animated.timing(titleFloat, {
          toValue: 0,
          duration: 1350,
          useNativeDriver: true,
        }),
      ]),
    );

    const gifFloatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(gifFloat, {
          toValue: -12,
          duration: 1750,
          useNativeDriver: true,
        }),
        Animated.timing(gifFloat, {
          toValue: 0,
          duration: 1750,
          useNativeDriver: true,
        }),
      ]),
    );

    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowScale, {
          toValue: 1.04,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 0.96,
          duration: 1800,
          useNativeDriver: true,
        }),
      ]),
    );

    const sparkleAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleDrift, {
          toValue: 1,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(sparkleDrift, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ]),
    );

    introAnimation.start();
    titleFloatAnimation.start();
    gifFloatAnimation.start();
    glowAnimation.start();
    sparkleAnimation.start();

    return () => {
      titleFloatAnimation.stop();
      gifFloatAnimation.stop();
      glowAnimation.stop();
      sparkleAnimation.stop();
    };
  }, [contentOpacity, contentTranslateY, gifFloat, glowScale, sparkleDrift, titleFloat]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#DBE0F9', '#EEF1FD', '#FFFFFF']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.orbPrimary,
          {
            transform: [
              {
                translateY: sparkleDrift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 14],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          styles.orbSoft,
          {
            transform: [
              {
                translateY: sparkleDrift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -12],
                }),
              },
            ],
          },
        ]}
      />
      <View pointerEvents="none" style={[styles.sparkle, styles.sparkleOne]} />
      <View pointerEvents="none" style={[styles.sparkle, styles.sparkleTwo]} />
      <View pointerEvents="none" style={[styles.sparkle, styles.sparkleThree]} />

      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: contentOpacity,
              transform: [{translateY: contentTranslateY}],
            },
          ]}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YEOGIDAM</Text>
            <Text style={styles.eyebrowSubcopy}>SAVE YOUR FAVORITE PLACES</Text>
          </View>

          <View style={styles.hero}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glow,
                {
                  transform: [{scale: glowScale}],
                },
              ]}
            />

            <View style={styles.wordRow}>
              {['여', '기', '담'].map((letter, index) => {
                const direction = index === 1 ? -1 : 1;
                const amplitude = index === 1 ? 1.05 : index === 0 ? 0.78 : 0.9;

                return (
                  <Animated.View
                    key={letter}
                    style={[
                      index === 0 && styles.wordChipLeft,
                      index === 1 && styles.wordChipMiddle,
                      index === 2 && styles.wordChipRight,
                      {
                        transform: [
                          {
                            translateY: Animated.multiply(titleFloat, amplitude * direction),
                          },
                          {
                            rotate: `${direction * 2.5}deg`,
                          },
                        ],
                      },
                    ]}>
                    <Text style={styles.wordText}>{letter}</Text>
                  </Animated.View>
                );
              })}
            </View>

            <Animated.View
              style={[
                styles.gifWrap,
                {
                  transform: [{translateY: gifFloat}],
                },
              ]}>
              <Image
                source={require('../../assets/illustrations/moving-emotion.gif')}
                style={styles.heroGif}
              />
            </Animated.View>
          </View>
        </Animated.View>

        <View style={styles.footer}>
          <ActivityIndicator color="#5f6fc7" size="small" />
          <Text style={styles.footerText}>공간 취향을 불러오는 중</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DBE0F9',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  content: {
    paddingTop: 12,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#5f6fc7',
  },
  eyebrowSubcopy: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: '#7f8ecf',
  },
  hero: {
    marginTop: 34,
    alignItems: 'center',
    minHeight: 560,
  },
  glow: {
    position: 'absolute',
    width: 324,
    height: 324,
    borderRadius: 162,
    backgroundColor: 'rgba(219, 224, 249, 0.72)',
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 14,
    marginTop: 28,
  },
  wordChipMiddle: {
    marginBottom: 16,
  },
  wordChipLeft: {
    marginBottom: 6,
  },
  wordChipRight: {
    marginBottom: 10,
  },
  wordText: {
    fontSize: 44,
    fontWeight: '900',
    color: '#2a2f56',
    textShadowColor: 'rgba(255, 255, 255, 0.72)',
    textShadowOffset: {
      width: 0,
      height: 6,
    },
    textShadowRadius: 18,
  },
  gifWrap: {
    marginTop: 42,
    borderRadius: 48,
    overflow: 'hidden',
    shadowColor: '#9aa9eb',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 10,
  },
  heroGif: {
    width: 560,
    height: 560,
    resizeMode: 'contain',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f6fc7',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbPrimary: {
    top: 88,
    right: -34,
    width: 194,
    height: 194,
    backgroundColor: 'rgba(193, 202, 246, 0.58)',
  },
  orbSoft: {
    bottom: 176,
    left: -36,
    width: 156,
    height: 156,
    backgroundColor: 'rgba(245, 248, 255, 0.92)',
  },
  sparkle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  sparkleOne: {
    top: 172,
    left: 58,
  },
  sparkleTwo: {
    top: 242,
    right: 72,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sparkleThree: {
    bottom: 254,
    right: 44,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
