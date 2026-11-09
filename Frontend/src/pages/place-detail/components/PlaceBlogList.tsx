import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PLACE_TAB_CONTENT_MIN_HEIGHT } from './PlaceInformation';
import { MOCK_BLOG_POSTS } from './placeDetailMock';

export function PlaceBlogList() {
  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {MOCK_BLOG_POSTS.map((post, index) => (
          <View
            key={post.id}
            style={[
              styles.card,
              index < MOCK_BLOG_POSTS.length - 1 && styles.cardDivider,
            ]}
          >
            <View style={styles.text}>
              <Text style={styles.title}>{post.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {post.meta}
              </Text>
            </View>
            <View style={styles.thumbnail} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: PLACE_TAB_CONTENT_MIN_HEIGHT,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
  },
  list: {
    paddingTop: 4,
  },
  card: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ececf0',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    color: '#1a1a2e',
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8e8e93',
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#d9dce8',
  },
});
