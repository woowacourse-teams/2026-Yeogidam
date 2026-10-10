import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {OAuthProvider} from '../../entities/user/types';
import type {DeleteAccountError} from '../../lib/auth/deleteAccount';
import {reauthenticateDeletionProvider} from '../../lib/auth/deleteAccount';

type AccountDeletionScreenProps = {
  provider: OAuthProvider;
  onBack: () => void;
  onDeleteAccount: (authorizationCode: string) => Promise<void>;
};

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  APPLE: 'Apple',
  GOOGLE: 'Google',
  KAKAO: '카카오',
};

export function AccountDeletionScreen({
  provider,
  onBack,
  onDeleteAccount,
}: AccountDeletionScreenProps) {
  const [confirmation, setConfirmation] = useState('');
  const [authorizationCode, setAuthorizationCode] = useState<string | null>(
    null,
  );
  const [isReauthPending, setIsReauthPending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);

  const isReauthenticated = authorizationCode !== null;

  const isReadyToDelete =
    confirmation === 'DELETE' && isReauthenticated && !isDeleting;

  const handleReauthenticate = async () => {
    if (isDeleting || isReauthPending) {
      return;
    }

    setIsReauthPending(true);
    setError(null);

    try {
      setAuthorizationCode(await reauthenticateDeletionProvider(provider));
    } catch (nextError) {
      setError(nextError as DeleteAccountError);
    } finally {
      setIsReauthPending(false);
    }
  };

  const resetReauthenticationState = () => {
    setAuthorizationCode(null);
  };

  const handleDelete = async () => {
    if (!isReadyToDelete || authorizationCode === null) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteAccount(authorizationCode);
    } catch (nextError) {
      const apiError = nextError as DeleteAccountError;

      setError(apiError);

      // 인가 코드는 한 번만 쓸 수 있어서, 서버가 코드를 거절했거나 쓰고 실패하면 다시 인증해야 합니다.
      if (
        apiError.errorCode === 'AUTH401_002' ||
        apiError.errorCode === 'AUTH502_001'
      ) {
        resetReauthenticationState();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.headerAction}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>회원탈퇴</Text>
        <View style={styles.headerAction} />
      </View>

      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>탈퇴 후에는 복구할 수 없어요.</Text>
          <Text style={styles.warningBody}>
            프로필, 저장한 장소, 계정 정보가 모두 삭제됩니다. 계속하려면 아래
            확인 절차를 완료해주세요.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. 복구 불가 안내 확인</Text>
          <Text style={styles.sectionBody}>
            탈퇴를 진행하려면 아래 입력칸에 정확히 `DELETE`를 입력해주세요.
          </Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setConfirmation}
            placeholder="DELETE"
            placeholderTextColor="#b8b8bf"
            style={styles.confirmationInput}
            value={confirmation}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. 로그인 제공자 재인증</Text>
          <Text style={styles.sectionBody}>
            연결된 로그인 계정 해제를 위해 아래 제공자를 다시 인증해주세요.
          </Text>
          <View style={styles.providerRow}>
            <View style={styles.providerTextGroup}>
              <Text style={styles.providerName}>
                {PROVIDER_LABELS[provider]}
              </Text>
              <Text style={styles.providerStatus}>
                {isReauthenticated
                  ? '재인증 완료'
                  : '탈퇴 전 다시 로그인해주세요.'}
              </Text>
            </View>
            <Pressable
              disabled={isDeleting || isReauthPending}
              onPress={handleReauthenticate}
              style={({pressed}) => [
                styles.providerButton,
                isReauthenticated && styles.providerButtonCompleted,
                (isDeleting || isReauthPending) && styles.providerButtonDisabled,
                pressed &&
                  !isDeleting &&
                  !isReauthPending &&
                  styles.providerButtonPressed,
              ]}>
              <Text
                style={[
                  styles.providerButtonText,
                  isReauthenticated && styles.providerButtonTextCompleted,
                ]}>
                {isReauthPending
                  ? '진행 중...'
                  : isReauthenticated
                    ? '다시 인증'
                    : '재인증'}
              </Text>
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error.message}</Text>
            {error.requestId ? (
              <Text style={styles.requestIdText}>requestId: {error.requestId}</Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          disabled={!isReadyToDelete}
          onPress={handleDelete}
          style={({pressed}) => [
            styles.deleteButton,
            !isReadyToDelete && styles.deleteButtonDisabled,
            pressed && isReadyToDelete && styles.deleteButtonPressed,
          ]}>
          <Text style={styles.deleteButtonText}>
            {isDeleting ? '회원탈퇴 처리 중...' : '회원탈퇴'}
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
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 48,
  },
  warningCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#121212',
  },
  warningBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#121212',
  },
  section: {
    marginTop: 28,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6372',
  },
  confirmationInput: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#121212',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ececf1',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  providerTextGroup: {
    flex: 1,
    gap: 4,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  providerStatus: {
    fontSize: 13,
    color: '#727789',
  },
  providerButton: {
    minWidth: 92,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: '#1f2238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerButtonCompleted: {
    backgroundColor: '#dbe0f9',
  },
  providerButtonDisabled: {
    opacity: 0.7,
  },
  providerButtonPressed: {
    opacity: 0.88,
  },
  providerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  providerButtonTextCompleted: {
    color: '#2a2a44',
  },
  errorBox: {
    marginTop: 24,
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
  requestIdText: {
    marginTop: 8,
    fontSize: 12,
    color: '#8b5d5d',
  },
  deleteButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  deleteButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  deleteButtonPressed: {
    opacity: 0.88,
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
