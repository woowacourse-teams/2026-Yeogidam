import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import type {User} from '../../../entities/user/types';

type ProfileSectionProps = {
  user: User;
};

export function ProfileSection({user}: ProfileSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>여</Text>
      </View>
      <Text style={styles.name}>{user.nickname}</Text>
      <Text style={styles.description}>{user.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 42,
    borderBottomWidth: 8,
    borderBottomColor: '#f5f3ee',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dbe0f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 12,
  },
  description: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 6,
  },
});
