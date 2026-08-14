import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {SavedPlacesApiError} from '../../../entities/info/types';

type SavedPlacesErrorStateProps = {
  error: SavedPlacesApiError;
  onRetry: () => void;
};

export function SavedPlacesErrorState({error, onRetry}: SavedPlacesErrorStateProps) {
  return (
    <View style={styles.content}>
      <Text style={styles.message}>{error.message}</Text>
      {error.retryable ? (
        <Pressable onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>다시 시도</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  message: {color: '#2a2a44', fontSize: 16, textAlign: 'center'},
  button: {marginTop: 16, borderRadius: 20, backgroundColor: '#DBE0F9', paddingHorizontal: 20, paddingVertical: 11},
  buttonText: {color: '#2a2a44', fontSize: 14, fontWeight: '700'},
});
