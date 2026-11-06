import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppModal } from './AppModal';
import {
  dismissAppAlert,
  getCurrentAppAlert,
  subscribeAppAlerts,
} from '../lib/app-alert';

export function AppAlertHost() {
  const alert = useSyncExternalStore(subscribeAppAlerts, getCurrentAppAlert);
  const cancelIndex = alert?.buttons.findIndex(button => button.style === 'cancel') ?? -1;
  const dismiss = () => dismissAppAlert(cancelIndex >= 0 ? cancelIndex : undefined);

  return (
    // iOS에서는 표시 애니메이션 중 첫 터치가 무시되지 않도록 즉시 엽니다.
    <AppModal animationType="none" transparent visible={alert !== null} onRequestClose={dismiss}>
      {alert && (
        <View style={styles.backdrop}>
          <Pressable accessible={false} onPress={dismiss} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text style={styles.title}>{alert.title}</Text>
            {!!alert.message && <Text style={styles.message}>{alert.message}</Text>}
            <View style={[styles.actions, alert.buttons.length > 2 && styles.stackedActions]}>
              {alert.buttons.map((button, index) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${index}-${button.text}`}
                  onPress={() => dismissAppAlert(index)}
                  style={styles.action}
                >
                  <Text
                    style={[
                      styles.actionText,
                      button.style === 'destructive' && styles.destructiveText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 32,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingTop: 24,
    overflow: 'hidden',
  },
  title: {
    color: '#1a1a2e',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  message: {
    color: '#44465a',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d7d7dc',
    marginTop: 24,
  },
  stackedActions: {
    flexDirection: 'column',
  },
  action: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#4f65d9',
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveText: {
    color: '#e5484d',
  },
});
