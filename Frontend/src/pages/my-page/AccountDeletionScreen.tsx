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
  AccountDeletionProvider,
  DeleteAccountError,
  DeleteAccountRequest,
} from '../../lib/auth/deleteAccount';
import {reauthenticateDeletionProvider} from '../../lib/auth/deleteAccount';

type AccountDeletionScreenProps = {
  linkedProviders: AccountDeletionProvider[];
  onBack: () => void;
  onDeleteAccount: (payload: DeleteAccountRequest) => Promise<void>;
};

type ReauthState = {
  appleAuthorizationCode?: string;
  providerTokens: {
    google?: string;
    kakao?: string;
  };
};

const PROVIDER_LABELS: Record<AccountDeletionProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  kakao: '카카오',
};

export function AccountDeletionScreen({
  linkedProviders,
  onBack,
  onDeleteAccount,
}: AccountDeletionScreenProps) {
  const [confirmation, setConfirmation] = useState('');
  const [reauthState, setReauthState] = useState<ReauthState>({
    providerTokens: {},
  });
  const [reauthPendingProvider, setReauthPendingProvider] =
    useState<AccountDeletionProvider | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);

  const reauthenticatedProviders = useMemo(() => {
    const completedProviders = new Set<AccountDeletionProvider>();

    if (reauthState.providerTokens.google) {
      completedProviders.add('google');
    }

    if (reauthState.providerTokens.kakao) {
      completedProviders.add('kakao');
    }

    if (reauthState.appleAuthorizationCode) {
      completedProviders.add('apple');
    }

    return completedProviders;
  }, [reauthState]);

  const isReadyToDelete =
    confirmation === 'DELETE' &&
    linkedProviders.every(provider => reauthenticatedProviders.has(provider)) &&
    !isDeleting;

  const handleReauthenticate = async (provider: AccountDeletionProvider) => {
    if (isDeleting || reauthPendingProvider) {
      return;
    }

    setReauthPendingProvider(provider);
    setError(null);

    try {
      const payload = await reauthenticateDeletionProvider(provider);

      setReauthState(current => ({
        appleAuthorizationCode:
          payload.appleAuthorizationCode ?? current.appleAuthorizationCode,
        providerTokens: {
          ...current.providerTokens,
          ...payload.providerTokens,
        },
      }));
    } catch (nextError) {
      setError(nextError as DeleteAccountError);
    } finally {
      setReauthPendingProvider(null);
    }
  };

  const resetReauthenticationState = () => {
    setReauthState({
      providerTokens: {},
    });
  };

  const handleDelete = async () => {
    if (!isReadyToDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDeleteAccount({
        confirmation: 'DELETE',
        ...(Object.keys(reauthState.providerTokens).length > 0
          ? {providerTokens: reauthState.providerTokens}
          : {}),
        ...(reauthState.appleAuthorizationCode
          ? {appleAuthorizationCode: reauthState.appleAuthorizationCode}
          : {}),
      });
    } catch (nextError) {
      const apiError = nextError as DeleteAccountError;

      setError(apiError);

      if (apiError.errorCode === 'USER502_001') {
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
          {linkedProviders.length === 0 ? (
            <Text style={styles.helperText}>
              추가 재인증이 필요한 소셜 로그인 계정이 없어요.
            </Text>
          ) : (
            <View style={styles.providerList}>
              {linkedProviders.map(provider => {
                const isPending = reauthPendingProvider === provider;
                const isCompleted = reauthenticatedProviders.has(provider);

                return (
                  <View key={provider} style={styles.providerRow}>
                    <View style={styles.providerTextGroup}>
                      <Text style={styles.providerName}>
                        {PROVIDER_LABELS[provider]}
                      </Text>
                      <Text style={styles.providerStatus}>
                        {isCompleted
                          ? '재인증 완료'
                          : '탈퇴 전 다시 로그인해주세요.'}
                      </Text>
                    </View>
                    <Pressable
                      disabled={isDeleting || isPending}
                      onPress={() => handleReauthenticate(provider)}
                      style={({pressed}) => [
                        styles.providerButton,
                        isCompleted && styles.providerButtonCompleted,
                        (isDeleting || isPending) && styles.providerButtonDisabled,
                        pressed &&
                          !isDeleting &&
                          !isPending &&
                          styles.providerButtonPressed,
                      ]}>
                      <Text
                        style={[
                          styles.providerButtonText,
                          isCompleted && styles.providerButtonTextCompleted,
                        ]}>
                        {isPending
                          ? '진행 중...'
                          : isCompleted
                            ? '다시 인증'
                            : '재인증'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
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
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#8e8e93',
  },
  providerList: {
    gap: 12,
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
