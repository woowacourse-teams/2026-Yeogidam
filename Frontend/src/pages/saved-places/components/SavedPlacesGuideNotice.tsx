import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import Svg, {Path} from 'react-native-svg';

function OpenBookIcon() {
  return (
    <Svg width={26} height={24} viewBox="0 0 28 26" fill="none">
      <Path
        d="M14 6.2C10.5 3.6 6.1 3.3 2.8 5.2v16.2c3.5-1.8 7.7-1.5 11.2 1.1m0-16.3C17.5 3.6 21.9 3.3 25.2 5.2v16.2c-3.5-1.8-7.7-1.5-11.2 1.1m0-16.3v16.3"
        stroke="#8589C8"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type SavedPlacesGuideNoticeProps = {
  topOffset: number;
  onOpenGuide: () => void;
};

export function SavedPlacesGuideNotice({
  topOffset,
  onOpenGuide,
}: SavedPlacesGuideNoticeProps) {
  return (
    <View
      testID="saved-places-guide-overlay"
      pointerEvents="box-none"
      style={[styles.overlay, {top: topOffset}]}>
      <Pressable
        testID="saved-places-guide-card"
        accessibilityRole="button"
        accessibilityLabel="저장 방법 알아보기"
        onPress={onOpenGuide}
        style={({pressed}) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.content}>
          <OpenBookIcon />
          <Text numberOfLines={1} style={styles.label}>
            저장 방법 알아보기
          </Text>
        </View>
        <MaterialIcons
          color="#87899A"
          name="chevron-right"
          size={22}
          style={styles.chevron}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 7,
    elevation: 7,
  },
  card: {
    height: 48,
    borderWidth: 1,
    borderColor: '#E1E3F6',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2238',
    shadowOpacity: 0.035,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 5,
    elevation: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 38,
  },
  label: {
    flexShrink: 1,
    color: '#1F2238',
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    position: 'absolute',
    right: 12,
  },
  pressed: {opacity: 0.65},
});
