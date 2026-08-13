import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';

import InstagramIcon from '../../../assets/icons/social/instagram.svg';
import NaverBlogIcon from '../../../assets/icons/social/naver-blog.svg';
import YoutubeIcon from '../../../assets/icons/social/youtube.svg';
import type {
  PlacePost,
  SocialPlatform,
} from '../../../entities/place-post/types';

type PlacePostGridProps = {
  posts: PlacePost[];
};

const socialIcons: Record<SocialPlatform, React.ComponentType<SvgProps>> = {
  instagram: InstagramIcon,
  'naver-blog': NaverBlogIcon,
  youtube: YoutubeIcon,
};

const GRID_HORIZONTAL_PADDING = 12;
const COLUMN_GAP = 10;

export function PlacePostGrid({ posts }: PlacePostGridProps) {
  const [gridWidth, setGridWidth] = useState(0);

  if (posts.length === 0) {
    return null;
  }

  const columnWidth =
    (gridWidth - GRID_HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2;

  const columns = [
    posts.filter((_, index) => index % 2 === 0),
    posts.filter((_, index) => index % 2 === 1),
  ];

  return (
    <View
      style={styles.grid}
      onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
    >
      {columnWidth > 0
        ? columns.map((column, columnIndex) => (
            <View
              key={columnIndex}
              style={[styles.column, { width: columnWidth }]}
            >
              {column.map(post => (
                <PostCard key={post.id} post={post} imageWidth={columnWidth} />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

function PostCard({
  post,
  imageWidth,
}: {
  post: PlacePost;
  imageWidth: number;
}) {
  const SocialIcon = socialIcons[post.platform];
  const { width, height } = Image.resolveAssetSource(post.image);
  const imageHeight = imageWidth * (height / width);

  return (
    <View style={styles.card}>
      <View
        style={[styles.imageClip, { width: imageWidth, height: imageHeight }]}
      >
        <Image source={post.image} style={styles.image} resizeMode="cover" />
      </View>
      <View style={styles.accountRow}>
        <SocialIcon width={18} height={18} opacity={0.45} />
        <Text style={styles.account} numberOfLines={1}>
          {post.authorHandle}
        </Text>
      </View>
      <Text style={styles.title}>{post.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: 12,
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  column: {
    flexShrink: 0,
  },
  card: {
    width: '100%',
    marginBottom: 18,
  },
  imageClip: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  accountRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  account: {
    flex: 1,
    fontSize: 14,
    color: '#8e8e93',
  },
  title: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});
