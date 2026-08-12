import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import {
  Alert,
  Dimensions,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Place } from '../../../entities/place/types';
import { useCopyToast } from './CopyToast';

const INFORMATION_MIN_HEIGHT = Dimensions.get('window').height - 162;

type PlaceInformationProps = {
  place: Place;
};

export function PlaceInformation({ place }: PlaceInformationProps) {
  const confirmCall = () => {
    if (!place.telephone) {
      return;
    }

    Alert.alert('전화 걸기', `${place.telephone}로 전화하시겠어요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '전화',
        onPress: () => Linking.openURL(`tel:${place.telephone}`),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoRow}>
        <InfoIcon type="location" />
        <View style={styles.addressList}>
          <AddressLine
            label="도로명"
            address={place.fullAddress}
            toastMessage="도로명 주소가 복사되었습니다."
          />
          <AddressLine
            label="지번"
            address={place.address}
            toastMessage="지번 주소가 복사되었습니다."
          />
        </View>
      </View>

      {place.telephone ? (
        <View style={styles.infoRow}>
          <InfoIcon type="phone" />
          <Pressable
            onPress={confirmCall}
            style={({ pressed }) => [styles.value, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${place.telephone}로 전화하기`}
          >
            <Text style={styles.linkValue}>{place.telephone}</Text>
          </Pressable>
          <CopyButton
            value={place.telephone}
            toastMessage="전화번호가 복사되었습니다."
            accessibilityLabel="전화번호 복사"
          />
        </View>
      ) : null}
    </View>
  );
}

function AddressLine({
  label,
  address,
  toastMessage,
}: {
  label: string;
  address: string;
  toastMessage: string;
}) {
  return (
    <View style={styles.addressLine}>
      <Text style={styles.addressLabel}>{label}</Text>
      <Text style={styles.address} numberOfLines={1}>
        {address}
      </Text>
      <CopyButton
        value={address}
        toastMessage={toastMessage}
        accessibilityLabel={`${label} 주소 복사`}
      />
    </View>
  );
}

function CopyButton({
  value,
  toastMessage,
  accessibilityLabel,
}: {
  value: string;
  toastMessage: string;
  accessibilityLabel: string;
}) {
  const { showCopyToast } = useCopyToast();

  const copy = () => {
    Clipboard.setString(value);
    showCopyToast(toastMessage);
  };

  return (
    <Pressable
      onPress={copy}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.actionText}>복사</Text>
    </Pressable>
  );
}

function InfoIcon({ type }: { type: 'location' | 'phone' }) {
  return (
    <View style={styles.iconContainer}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        {type === 'location' ? (
          <>
            <Path
              d="M20 10c0 5.2-8 11-8 11s-8-5.8-8-11a8 8 0 1 1 16 0Z"
              stroke="#1A1A2E"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle
              cx={12}
              cy={10}
              r={2.5}
              stroke="#1A1A2E"
              strokeWidth={1.8}
            />
          </>
        ) : (
          <Path
            d="M7.2 3.5 4.8 5.9c-.8.8-.9 2-.3 3 2.5 4.3 6.1 7.9 10.4 10.4 1 .6 2.2.5 3-.3l2.4-2.4-4.2-3.1-2.1 2.1a16 16 0 0 1-5.5-5.5l2.1-2.1-3.4-4.5Z"
            stroke="#1A1A2E"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: INFORMATION_MIN_HEIGHT,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 32,
    backgroundColor: '#ffffff',
  },
  infoRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconContainer: {
    width: 34,
    height: 34,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressList: {
    flex: 1,
    gap: 7,
  },
  addressLine: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressLabel: {
    marginRight: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7D9DF',
    fontSize: 11,
    color: '#8E8E93',
  },
  address: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#27272E',
  },
  value: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    color: '#27272E',
  },
  linkValue: {
    color: '#5F6FC7',
  },
  actionText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '400',
    color: '#5F6FC7',
  },
  pressed: {
    opacity: 0.55,
  },
});
