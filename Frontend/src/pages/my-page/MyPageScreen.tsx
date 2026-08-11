import React from 'react';
import {StyleSheet, View} from 'react-native';

import {ScreenHeader} from '../../components/ScreenHeader';
import {currentUserMock} from '../../entities/user/mocks';
import {ProfileSection} from './components/ProfileSection';
import {SettingList} from './components/SettingList';

const settingItems = [
  '내가 저장한 장소',
  '최근 본 장소',
  '알림 설정',
  '앱 설정',
];

export function MyPageScreen() {
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
