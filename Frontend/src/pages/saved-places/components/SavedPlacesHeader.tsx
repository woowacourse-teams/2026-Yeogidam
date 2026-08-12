import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

type SavedPlacesHeaderProps = {
  onPressSearch: () => void;
};

export function SavedPlacesHeader({
  onPressSearch,
}: SavedPlacesHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.leading}>
        <Image
          source={require('../../../assets/illustrations/empty-illustration.png')}
          style={styles.leadingImage}
        />
      </View>
      <View style={styles.placeholder} />
      <Pressable onPress={onPressSearch} style={styles.action}>
        <MaterialIcons color="#d8dffe" name="search" size={24} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 76,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leading: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadingImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholder: {
    flex: 1,
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 14,
    elevation: 6,
  },
});
