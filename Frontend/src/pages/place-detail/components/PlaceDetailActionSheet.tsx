import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import type {SavedPlacesApiError} from '../../../entities/info/types';

type PlaceDetailActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  deleteError?: SavedPlacesApiError | null;
};

export function PlaceDetailActionSheet({
  visible,
  onClose,
  onDelete,
  isDeleting = false,
  deleteError = null,
}: PlaceDetailActionSheetProps) {
  return (
    <Modal
      animationType="none"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={event => event.stopPropagation()}
          style={styles.sheet}>
          <View style={styles.handle} />
          <Pressable
            accessibilityLabel="장소 삭제하기"
            accessibilityRole="button"
            disabled={isDeleting}
            onPress={onDelete}
            style={({pressed}) => [
              styles.deleteButton,
              isDeleting && styles.deleteButtonDisabled,
              pressed && styles.deleteButtonPressed,
            ]}>
            <MaterialIcons color="#000000" name="delete-outline" size={21} />
            <Text style={styles.deleteButtonText}>
              {isDeleting ? '삭제 중...' : '삭제하기'}
            </Text>
          </Pressable>
          {deleteError ? (
            <View style={styles.errorArea}>
              <Text style={styles.errorText}>{deleteError.message}</Text>
              {deleteError.retryable ? (
                <Pressable onPress={onDelete}>
                  <Text style={styles.retryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d9d9df',
  },
  deleteButton: {
    height: 54,
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9d9df',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
  },
  deleteButtonPressed: {
    opacity: 0.72,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  errorArea: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    flex: 1,
    color: '#b42318',
    fontSize: 13,
    lineHeight: 18,
  },
  retryText: {
    color: '#1f2238',
    fontSize: 13,
    fontWeight: '800',
  },
});
