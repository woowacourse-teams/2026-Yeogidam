import React, { useRef } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';

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

async function openBlogPost(url: string) {
  try {
    if (await InAppBrowser.isAvailable()) {
      await InAppBrowser.open(url, {
        // 옵션을 넘기면 라이브러리 기본값이 빠지므로 표시 방식을 직접 지정합니다.
        animated: true,
        modalEnabled: true,
        modalPresentationStyle: 'fullScreen',
        modalTransitionStyle: 'coverVertical',
        dismissButtonStyle: 'close',
        preferredBarTintColor: '#ffffff',
        preferredControlTintColor: '#121212',
        showTitle: true,
        toolbarColor: '#ffffff',
        navigationBarColor: '#ffffff',
        navigationBarDividerColor: '#e4e4e7',
      });
      return;
    }
  } catch {
    // 인앱 브라우저를 띄우지 못하면 아래에서 외부 브라우저로 엽니다.
  }

  await Linking.openURL(url);
}

export function PlaceBlogList({
  posts = [],
  isLoading = false,
  error = null,
  onRetry,
}: PlaceBlogListProps) {
  const { button } = useScreenAnalytics();
  // 브라우저가 떠 있는 동안 또 열면 iOS가 거절해 외부 브라우저까지 열리므로 한 번만 엽니다.
  const isOpeningRef = useRef(false);

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
              if (isOpeningRef.current) return;
              isOpeningRef.current = true;
              button('open_blog_post');
              openBlogPost(post.link)
                .catch(() => undefined)
                .finally(() => {
                  isOpeningRef.current = false;
                });
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
