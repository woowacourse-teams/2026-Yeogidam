import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
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
          source={require('../../../assets/icons/brand-mark.png')}
          style={styles.leadingImage}
        />
      </View>
      <Pressable onPress={onPressSearch} style={styles.searchBar}>
        <Text style={styles.searchPlaceholder}>여기담 검색</Text>
        <View style={styles.searchAction}>
          <MaterialIcons color="#d8dffe" name="search" size={18} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 84,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  leading: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadingImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  searchBar: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowRadius: 12,
    elevation: 5,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    color: '#a9a9ae',
  },
  searchAction: {
    width: 30,
    height: 30,
    marginLeft: 10,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowRadius: 10,
    elevation: 4,
  },
});
