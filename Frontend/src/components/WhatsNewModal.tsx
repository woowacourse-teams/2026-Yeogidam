import React, {useCallback, useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {AppModal} from './AppModal';
import {useScreenAnalytics} from '../analytics/uiEvents';
import {WHATS_NEW} from '../lib/whats-new-content';
import {hasSeenWhatsNew, rememberSeenWhatsNew} from '../lib/whats-new-storage';

type WhatsNewModalProps = {
  // 스토어 업데이트 안내처럼 먼저 보여야 하는 모달이 있으면 false로 미룹니다.
  enabled: boolean;
  // 이 안내가 떠 있거나 뜰지 아직 모르는 동안 true. 뒤에 띄울 모달을 미룰 때 씁니다.
  onBlockingChange?: (blocking: boolean) => void;
};

// 업데이트 후 바뀐 점을 알리는 모달입니다. 이벤트 안내 모달과 같은 가운데 카드 형태입니다. 앱 버전이 아니라 WHATS_NEW.id로 한 번만 보여줍니다.
export function WhatsNewModal({enabled, onBlockingChange}: WhatsNewModalProps) {
  const {id, title, confirmLabel, items} = WHATS_NEW;
  const hasContent = items.length > 0;
  const [isSeen, setIsSeen] = useState<boolean | null>(null);
  const {button, modal} = useScreenAnalytics('whats_new');

  useEffect(() => {
    if (!hasContent) return;
    let active = true;
    hasSeenWhatsNew(id).then(seen => {
      if (active) setIsSeen(seen);
    });
    return () => {
      active = false;
    };
  }, [hasContent, id]);

  const visible = hasContent && enabled && isSeen === false;
  const blocking = hasContent && isSeen !== true;

  useEffect(() => {
    onBlockingChange?.(blocking);
  }, [blocking, onBlockingChange]);

  useEffect(() => {
    if (visible) modal('whats_new', {whats_new_id: id});
  }, [id, modal, visible]);

  const close = useCallback(
    (buttonName: string) => {
      button(buttonName, {whats_new_id: id});
      setIsSeen(true);
      rememberSeenWhatsNew(id).catch(() => undefined);
    },
    [button, id],
  );

  return (
    <AppModal
      animationType="fade"
      onRequestClose={() => close('dismiss')}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.backdrop}>
        <Pressable
          accessible={false}
          onPress={() => close('dismiss')}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.dialog}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../assets/illustrations/dami-looking-around-cropped.png')}
            style={styles.illustration}
          />
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <View style={styles.list}>
            {items.map(item => (
              <View key={item.title} style={styles.row}>
                <View style={styles.tile}>
                  <MaterialIcons color={item.color} name={item.icon} size={24} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowDescription}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => close('confirm')}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}
            testID="whats-new-confirm-button">
            <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  dialog: {
    alignItems: 'center',
    backgroundColor: '#F7F7F8',
    borderRadius: 30,
    maxWidth: 320,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.25,
    shadowRadius: 28,
    width: '100%',
  },
  illustration: {
    height: 104,
    marginTop: 8,
    width: 120,
  },
  title: {
    color: '#171719',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
    marginTop: 16,
    textAlign: 'center',
  },
  list: {
    alignSelf: 'stretch',
    gap: 12,
    marginTop: 20,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: '#ECECF0',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#171719',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rowDescription: {
    color: '#5A5A5F',
    fontSize: 14,
    letterSpacing: -0.25,
    lineHeight: 19,
    marginTop: 1,
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#5B63E8',
    borderRadius: 26,
    height: 49,
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  pressed: {
    opacity: 0.8,
  },
});
