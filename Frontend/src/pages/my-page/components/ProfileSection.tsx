import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

import type {User} from '../../../entities/user/types';

type ProfileSectionProps = {
  user: User;
};

export function ProfileSection({user}: ProfileSectionProps) {
  const [hasAvatarLoadError, setHasAvatarLoadError] = useState(false);

  useEffect(() => {
    setHasAvatarLoadError(false);
  }, [user.avatarUrl]);

  const avatarInitial = user.nickname.trim().charAt(0) || '여';
  const shouldShowAvatarImage = Boolean(user.avatarUrl) && !hasAvatarLoadError;

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        {shouldShowAvatarImage ? (
          <Image
            source={{uri: user.avatarUrl!}}
            style={styles.avatarImage}
            onError={() => setHasAvatarLoadError(true)}
          />
        ) : (
          <Text style={styles.avatarText}>{avatarInitial}</Text>
        )}
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
