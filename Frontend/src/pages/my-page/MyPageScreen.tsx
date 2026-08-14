import React from 'react';
import {StyleSheet, View} from 'react-native';

import {ScreenHeader} from '../../components/ScreenHeader';
import {currentUserMock} from '../../entities/user/mocks';
import {ProfileSection} from './components/ProfileSection';
import {SettingList} from './components/SettingList';

type MyPageScreenProps = {
  onOpenSavedPlaces?: () => void;
  onLogout?: () => void;
  isLogoutPending?: boolean;
};

export function MyPageScreen({
  onOpenSavedPlaces,
  onLogout,
  isLogoutPending = false,
}: MyPageScreenProps) {
  const settingItems = [
    {label: '내가 저장한 장소', onPress: onOpenSavedPlaces},
    {label: '최근 본 장소'},
    {label: '알림 설정'},
    {label: '앱 설정'},
    {label: isLogoutPending ? '로그아웃 중...' : '로그아웃', onPress: onLogout},
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="마이" />
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
