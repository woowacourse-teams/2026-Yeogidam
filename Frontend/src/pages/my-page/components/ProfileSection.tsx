import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import type {User} from '../../../entities/user/types';

type ProfileSectionProps = {
  user: User;
  isProfileUnavailable?: boolean;
  onPressEditProfile?: () => void;
  bottomContent?: React.ReactNode;
};

export function ProfileSection({
  user,
  isProfileUnavailable = false,
  onPressEditProfile,
  bottomContent,
}: ProfileSectionProps) {
  const [hasAvatarLoadError, setHasAvatarLoadError] = useState(false);

  useEffect(() => {
    setHasAvatarLoadError(false);
  }, [user.avatarUrl]);

  const avatarInitial = user.nickname.trim().charAt(0) || '여';
  const shouldShowAvatarImage = Boolean(user.avatarUrl) && !hasAvatarLoadError;

  return (
    <View
      style={[
        styles.container,
        isProfileUnavailable && styles.unavailableContainer,
      ]}>
      <View style={styles.avatarContainer}>
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
        {isProfileUnavailable ? (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableBadgeText}>!</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name}>
        {isProfileUnavailable ? '프로필을 불러오지 못했습니다.' : user.nickname}
      </Text>
      {!isProfileUnavailable && user.description ? (
        <Text style={styles.description}>{user.description}</Text>
      ) : null}
      {onPressEditProfile ? (
        <Pressable
          onPress={onPressEditProfile}
          style={({pressed}) => [
            styles.editButton,
            pressed && styles.editButtonPressed,
          ]}>
          <Text style={styles.editButtonText}>프로필 수정하기</Text>
        </Pressable>
      ) : null}
      {bottomContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 54,
    borderBottomWidth: 8,
    borderBottomColor: '#f5f3ee',
  },
  unavailableContainer: {
    paddingTop: 56,
    paddingBottom: 0,
  },
  avatarContainer: {
    position: 'relative',
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
  unavailableBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8e8e93',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableBadgeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
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
  editButton: {
    marginTop: 18,
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#d8dbe7',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  editButtonPressed: {
    backgroundColor: '#f6f7fb',
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2a2a44',
  },
});
