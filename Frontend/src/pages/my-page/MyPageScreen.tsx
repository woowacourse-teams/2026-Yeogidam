import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import type {ProfileApiError, ProfileInfo} from '../../entities/info/types';
import type {User} from '../../entities/user/types';
import {ProfileSection} from './components/ProfileSection';
import {SettingList} from './components/SettingList';

const DEFAULT_NICKNAME = '여기담 사용자';
const UNAVAILABLE_PROFILE: User = {
  id: 'profile-unavailable',
  nickname: DEFAULT_NICKNAME,
  description: '',
  avatarUrl: null,
};
const GUEST_PROFILE: User = {
  id: 'guest',
  nickname: '비회원',
  description: '',
  avatarUrl: null,
};

type MyPageScreenProps = {
  currentProfile: ProfileInfo | null;
  isGuest?: boolean;
  profileError?: ProfileApiError | null;
  isProfileLoading?: boolean;
  onOpenEditProfile?: () => void;
  onOpenContact?: () => void;
  onOpenGuide?: () => void;
  onOpenTerms?: () => void;
  onWithdraw?: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
  onRetryProfile?: () => void;
  onReauthenticate?: () => void;
  isLogoutPending?: boolean;
};

export function MyPageScreen({
  currentProfile,
  isGuest = false,
  profileError,
  isProfileLoading = false,
  onOpenEditProfile,
  onOpenContact,
  onOpenGuide,
  onOpenTerms,
  onWithdraw,
  onLogout,
  onLogin,
  onRetryProfile,
  onReauthenticate,
  isLogoutPending = false,
}: MyPageScreenProps) {
  const settingItems = [
    {label: '사용 가이드', onPress: onOpenGuide},
    {label: '약관 동의', onPress: onOpenTerms},
    {label: '문의하기', onPress: onOpenContact},
    ...(isGuest
      ? [{label: '로그인', onPress: onLogin}]
      : [
          {label: '회원탈퇴', onPress: onWithdraw},
          {label: isLogoutPending ? '로그아웃 중...' : '로그아웃', onPress: onLogout},
        ]),
  ];

  const user: User | null = currentProfile
    ? {
        id: currentProfile.id,
        nickname: currentProfile.nickname?.trim() || DEFAULT_NICKNAME,
        description: currentProfile.description?.trim() || '',
        avatarUrl: currentProfile.avatarUrl?.trim() || null,
      }
    : null;

  const showReauthenticateAction = profileError?.errorCode === 'PROFILE404_001';
  const isProfileUnavailable = !isGuest && !user && Boolean(profileError);
  const displayedUser = isGuest
    ? GUEST_PROFILE
    : user ?? (isProfileUnavailable ? UNAVAILABLE_PROFILE : null);
  const unavailableNotice = isProfileUnavailable ? (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>잠시 후 다시 시도해주세요</Text>
      {onRetryProfile ? (
        <Pressable
          disabled={isProfileLoading}
          onPress={onRetryProfile}
          style={({pressed}) => [
            pressed && !isProfileLoading && styles.errorBannerActionPressed,
          ]}>
          <Text style={styles.errorBannerAction}>
            {isProfileLoading ? '재시도 중...' : '재시도'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {displayedUser ? (
        <>
          <ProfileSection
            bottomContent={unavailableNotice}
            isProfileUnavailable={isProfileUnavailable}
            onPressEditProfile={
              isProfileUnavailable ? undefined : onOpenEditProfile
            }
            user={displayedUser}
          />
          <SettingList items={settingItems} />
        </>
      ) : isProfileLoading ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateMessage}>프로필 정보를 불러오는 중이에요.</Text>
        </View>
      ) : (
        <View style={styles.stateContainer}>
          <Text style={styles.stateMessage}>
            {profileError?.message ?? '프로필 정보를 불러오지 못했어요.'}
          </Text>
          {showReauthenticateAction && onReauthenticate ? (
            <Pressable onPress={onReauthenticate} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>다시 로그인</Text>
            </Pressable>
          ) : profileError?.retryable && onRetryProfile ? (
            <Pressable onPress={onRetryProfile} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateMessage: {
    color: '#2a2a44',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  primaryButton: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#DBE0F9',
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#2a2a44',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FFC7C7',
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorBannerText: {
    flex: 1,
    color: '#121212',
    fontSize: 15,
  },
  errorBannerAction: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBannerActionPressed: {
    opacity: 0.7,
  },
});
