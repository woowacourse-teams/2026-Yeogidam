import React, {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  ProfileApiError,
  ProfileInfo,
  UpdateCurrentProfileInput,
} from '../../entities/info/types';
import {AuthTextField} from '../login/components/AuthTextField';

type ProfileEditScreenProps = {
  profile: ProfileInfo;
  onBack: () => void;
  onSave: (input: UpdateCurrentProfileInput) => Promise<void>;
};

export function ProfileEditScreen({
  profile,
  onBack,
  onSave,
}: ProfileEditScreenProps) {
  const initialNickname = profile.nickname ?? '';
  const initialDescription = profile.description ?? '';
  const initialAvatarUrl = profile.avatarUrl ?? '';

  const [nickname, setNickname] = useState(initialNickname);
  const [description, setDescription] = useState(initialDescription);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<ProfileApiError | null>(null);

  const normalizedAvatarUrl = avatarUrl.trim() === '' ? null : avatarUrl.trim();
  const hasChanges =
    nickname !== initialNickname ||
    description !== initialDescription ||
    normalizedAvatarUrl !== (profile.avatarUrl ?? null);

  const patch = useMemo<UpdateCurrentProfileInput>(() => {
    const nextPatch: UpdateCurrentProfileInput = {};

    if (nickname !== initialNickname) {
      nextPatch.nickname = nickname;
    }

    if (description !== initialDescription) {
      nextPatch.description = description;
    }

    if (normalizedAvatarUrl !== (profile.avatarUrl ?? null)) {
      nextPatch.avatarUrl = normalizedAvatarUrl;
    }

    return nextPatch;
  }, [
    description,
    initialDescription,
    initialNickname,
    nickname,
    normalizedAvatarUrl,
    profile.avatarUrl,
  ]);

  const handleSave = async () => {
    if (isSaving || !hasChanges) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave(patch);
      onBack();
    } catch (error) {
      setSaveError(error as ProfileApiError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.headerAction}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>프로필 수정</Text>
        <Pressable
          disabled={!hasChanges || isSaving}
          onPress={handleSave}
          style={({pressed}) => [
            styles.saveButton,
            (!hasChanges || isSaving) && styles.saveButtonDisabled,
            pressed && hasChanges && !isSaving && styles.saveButtonPressed,
          ]}>
          <Text style={styles.saveButtonText}>
            {isSaving ? '저장 중...' : '저장'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.avatarPreview}>
          <Text style={styles.avatarInitial}>
            {(nickname.trim().charAt(0) || '여').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.avatarHint}>
          프로필 이미지 URL을 비워두면 기본 아바타로 표시됩니다.
        </Text>

        <View style={styles.form}>
          <AuthTextField
            label="닉네임"
            maxLength={20}
            onChangeText={setNickname}
            placeholder="표시할 닉네임을 입력하세요"
            value={nickname}
          />
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>소개</Text>
            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={setDescription}
              placeholder="프로필 소개를 입력하세요"
              placeholderTextColor="#b8b8bf"
              style={styles.textArea}
              textAlignVertical="top"
              value={description}
            />
          </View>
          <AuthTextField
            autoCapitalize="none"
            autoCorrect={false}
            helperText="선택"
            keyboardType="url"
            label="프로필 이미지 URL"
            onChangeText={setAvatarUrl}
            placeholder="https://example.com/avatar.jpg"
            value={avatarUrl}
          />
        </View>

        {saveError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{saveError.message}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={!hasChanges || isSaving}
          onPress={handleSave}
          style={({pressed}) => [
            styles.primaryButton,
            (!hasChanges || isSaving) && styles.primaryButtonDisabled,
            pressed && hasChanges && !isSaving && styles.primaryButtonPressed,
          ]}>
          <Text style={styles.primaryButtonText}>
            {isSaving ? '저장 중...' : '저장하기'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  back: {
    fontSize: 38,
    lineHeight: 38,
    color: '#1a1a2e',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  saveButton: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f2238',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  saveButtonDisabled: {
    backgroundColor: '#d6d8e2',
  },
  saveButtonPressed: {
    opacity: 0.88,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 48,
  },
  avatarPreview: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#dbe0f9',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
  },
  avatarHint: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 20,
    color: '#8e8e93',
    textAlign: 'center',
  },
  form: {
    marginTop: 28,
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#121212',
  },
  textArea: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: '#121212',
    lineHeight: 22,
  },
  errorBox: {
    marginTop: 20,
    borderRadius: 18,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7c2d2d',
  },
  primaryButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonDisabled: {
    backgroundColor: '#d6d8e2',
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
