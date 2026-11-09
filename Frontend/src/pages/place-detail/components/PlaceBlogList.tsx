import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PlaceTabEmptyState } from './PlaceTabEmptyState';

export type PlaceBlogPost = {
  id: string;
  title: string;
  meta: string;
};

type PlaceBlogListProps = {
  // TODO(API 연동): 블로그 글 API가 생기면 값을 넘깁니다. 그 전에는 빈 화면을 보여줍니다.
  posts?: PlaceBlogPost[];
};

export function PlaceBlogList({ posts = [] }: PlaceBlogListProps) {
  if (posts.length === 0) {
    return <PlaceTabEmptyState message="아직 등록된 블로그 글이 없어요" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {posts.map((post, index) => (
          <View
            key={post.id}
            style={[
              styles.card,
              index < posts.length - 1 && styles.cardDivider,
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
