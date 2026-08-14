import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

const SKELETON_CARD_COUNT = 6;

export function SavedPlacesSkeleton() {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.grid}>
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, index) => (
          <Animated.View
            key={`saved-place-skeleton-${index}`}
            style={[styles.card, { opacity }]}
          >
            <View style={styles.image} />
            <View style={styles.label}>
              <View style={styles.title} />
              <View style={styles.address} />
            </View>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 12,
    paddingBottom: 130,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48.5%',
    height: 248,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(241, 243, 251, 0.58)',
  },
  image: {
    flex: 1,
    backgroundColor: 'rgba(223, 229, 251, 0.54)',
  },
  label: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 8,
  },
  title: {
    width: '68%',
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
  },
  address: {
    width: '88%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});
