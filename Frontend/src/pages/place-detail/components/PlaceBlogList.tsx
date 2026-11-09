import React from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useScreenAnalytics } from '../../../analytics/uiEvents';
import type { PlaceDetailApiError } from '../usePlaceDetailData';
import { PostState } from './PlacePostGrid';
import { PlaceTabEmptyState } from './PlaceTabEmptyState';

export type PlaceBlogListItem = {
  id: string;
  title: string;
  meta: string;
  link: string;
  isNaver: boolean;
};

type PlaceBlogListProps = {
  posts?: PlaceBlogListItem[];
  isLoading?: boolean;
  error?: PlaceDetailApiError | null;
  onRetry?: () => void;
};

export function PlaceBlogList({
  posts = [],
  isLoading = false,
  error = null,
  onRetry,
}: PlaceBlogListProps) {
  const { button } = useScreenAnalytics();

  if (isLoading) {
    return <PostState message="블로그 글을 불러오는 중이에요." />;
  }

  if (error) {
    return (
      <PostState
        message={error.message}
        onRetry={error.retryable ? onRetry : undefined}
        retryEventName="retry_blogs"
      />
    );
  }

  if (posts.length === 0) {
    return <PlaceTabEmptyState message="아직 등록된 블로그 글이 없어요" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {posts.map((post, index) => (
          <Pressable
            key={post.id}
            accessibilityRole="link"
            accessibilityLabel={`${post.title} 블로그 글 열기`}
            onPress={() => {
              button('open_blog_post');
              Linking.openURL(post.link).catch(() => undefined);
            }}
            style={({ pressed }) => [
              styles.card,
              index < posts.length - 1 && styles.cardDivider,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.titleRow}>
              {post.isNaver ? (
                <Image
                  source={require('../../../assets/icons/naver-blog-logo.png')}
                  style={styles.sourceMark}
                />
              ) : null}
              <Text style={styles.title} numberOfLines={1}>
                {post.title}
              </Text>
            </View>
            <Text
              style={[styles.meta, post.isNaver && styles.metaBesideMark]}
              numberOfLines={1}
            >
              {post.meta}
            </Text>
          </Pressable>
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
    gap: 4,
  },
  cardDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ececf0',
  },
  pressed: {
    opacity: 0.55,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    flex: 1,
    minWidth: 0,
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
  // 로고 너비(24)와 제목과의 간격(12)만큼 들여 제목과 왼쪽을 맞춥니다.
  metaBesideMark: {
    paddingLeft: 36,
  },
  // TODO(BI): 출처를 확인할 수 없는 임시 파일입니다. 공식 마크와 사용 가능 여부를 확인한 뒤 교체합니다.
  sourceMark: {
    width: 24,
    height: 24,
    tintColor: '#03C75A',
  },
});
