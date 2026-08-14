import React from 'react';
import {StyleSheet, View} from 'react-native';

import {currentUserMock} from '../../entities/user/mocks';
import {ProfileSection} from './components/ProfileSection';
import {SettingList} from './components/SettingList';

type MyPageScreenProps = {
  onOpenTerms?: () => void;
  onWithdraw?: () => void;
  onLogout?: () => void;
  isLogoutPending?: boolean;
};

export function MyPageScreen({
  onOpenTerms,
  onWithdraw,
  onLogout,
  isLogoutPending = false,
}: MyPageScreenProps) {
  const settingItems = [
    {label: '약관 동의', onPress: onOpenTerms},
    {label: '회원탈퇴', onPress: onWithdraw},
    {label: isLogoutPending ? '로그아웃 중...' : '로그아웃', onPress: onLogout},
  ];

  return (
    <View style={styles.container}>
      <ProfileSection user={currentUserMock} />
      <SettingList items={settingItems} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
