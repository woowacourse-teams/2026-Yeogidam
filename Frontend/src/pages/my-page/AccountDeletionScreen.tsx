import React, {useState} from 'react';
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);
  // 회원은 소셜 로그인 제공자 하나로만 가입한다.
  const provider = linkedProviders[0] ?? null;

  const isReadyToDelete =
    confirmation === 'DELETE' && provider !== null && !isDeleting;

  /**
   * 인가 코드는 한 번만 쓸 수 있고 몇 분 안에 만료되므로, 탈퇴 버튼을 누를 때 재인증해
   * 받은 코드로 바로 탈퇴를 요청한다. 다시 시도할 때도 매번 새 코드를 받는다.
   */
  const handleDelete = async () => {
    if (!isReadyToDelete || !provider) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const payload = await reauthenticateDeletionProvider(provider);
      await onDeleteAccount(payload);
    } catch (nextError) {
      const deletionError = nextError as DeleteAccountError;
      // 사용자가 인증 창을 닫으면 탈퇴하지 않고 조용히 화면에 남는다.
      if (deletionError?.errorCode !== 'AUTH000_001') {
        setError(deletionError);
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
          <Text style={styles.sectionTitle}>2. 로그인 계정 다시 인증</Text>
          <Text style={styles.sectionBody}>
            {provider
              ? `회원탈퇴 버튼을 누르면 ${PROVIDER_LABELS[provider]} 인증 창이 열려요. 가입한 계정으로 인증하면 바로 탈퇴가 진행돼요.`
              : '로그인 계정을 확인하지 못했어요. 잠시 후 다시 시도해주세요.'}
          </Text>
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
            {isDeleting ? '회원탈퇴 진행 중...' : '회원탈퇴'}
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
