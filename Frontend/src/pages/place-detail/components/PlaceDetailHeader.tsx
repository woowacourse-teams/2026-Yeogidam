import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

export function PlaceDetailHeader() {
  const [isLiked, setIsLiked] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.back}>‹</Text>
      <Pressable
        onPress={() => setIsLiked(previous => !previous)}
        style={({pressed}) => [styles.heartButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? '좋아요 취소' : '좋아요'}
        accessibilityState={{selected: isLiked}}>
        <View style={styles.heartIconContainer}>
          <Text style={[styles.heart, isLiked && styles.filledHeart]}>
            {isLiked ? '♥' : '♡'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  heartButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F0F2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartIconContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heart: {
    fontSize: 31,
    lineHeight: 31,
    fontWeight: '500',
    color: '#C1CBFE',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    transform: [{translateX: 1}, {translateY: 2}],
  },
  filledHeart: {
    fontSize: 29,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
    transform: [{scale: 0.94}],
  },
});
