import React, { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import InstagramIcon from '../../../assets/icons/place-detail/instagram-outline.svg';
import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import { normalizeReelTitle } from '../../../entities/content/title';
import { useScreenAnalytics } from '../../../analytics/uiEvents';
import { PlaceTabEmptyState } from './PlaceTabEmptyState';

type PlacePostGridProps = {
  reels: PlaceReel[];
  error?: PlaceReelsApiError | null;
  isLoading?: boolean;
  onRetry?: () => void;
  /** 지정하면 게시물을 눌렀을 때 인스타그램 대신 앱 안의 게시물 상세로 이동합니다. */
  onOpenReel?: (reel: PlaceReel) => void;
};

const GRID_HORIZONTAL_PADDING = 12;
const COLUMN_GAP = 10;

export function PlacePostGrid({
  reels,
  error,
  isLoading = false,
  onRetry,
  onOpenReel,
}: PlacePostGridProps) {
  const [gridWidth, setGridWidth] = useState(0);

  if (isLoading) {
    return <PostState message="릴스를 불러오는 중이에요." />;
  }

  if (error) {
    return (
      <PostState
        message={error.message}
        onRetry={error.retryable ? onRetry : undefined}
      />
    );
  }

  if (reels.length === 0) {
    return <PlaceTabEmptyState message="아직 관련 릴스가 없어요" />;
  }

  const columnWidth =
    (gridWidth - GRID_HORIZONTAL_PADDING * 2 - COLUMN_GAP) / 2;

  const columns = [
    reels.filter((_, index) => index % 2 === 0),
    reels.filter((_, index) => index % 2 === 1),
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
              {column.map(reel => (
                <PostCard
                  key={reel.id}
                  reel={reel}
                  imageWidth={columnWidth}
                  onOpenReel={onOpenReel}
                />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

function PostCard({
  reel,
  imageWidth,
  onOpenReel,
}: {
  reel: PlaceReel;
  imageWidth: number;
  onOpenReel?: (reel: PlaceReel) => void;
}) {
  const { button } = useScreenAnalytics();
  const image = reel.instagramThumbnailUrl
    ? { uri: reel.instagramThumbnailUrl }
    : require('../../../assets/illustrations/empty-illustration.png');
  const asset = Image.resolveAssetSource(image);
  const imageHeight =
    imageWidth *
    (asset.width && asset.height ? asset.height / asset.width : 1.25);
  const captionPreview = normalizeReelTitle(reel.instagramDescription, null);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => {
        if (onOpenReel) {
          button('open_reel_detail');
          onOpenReel(reel);
        } else if (reel.instagramUrl) {
          button('open_instagram_post');
          Linking.openURL(reel.instagramUrl);
        }
      }}
      disabled={!onOpenReel && !reel.instagramUrl}
      accessibilityRole={
        onOpenReel ? 'button' : reel.instagramUrl ? 'link' : undefined
      }
      accessibilityLabel={
        onOpenReel
          ? '게시물 상세 열기'
          : reel.instagramUrl
            ? 'Instagram 릴스 열기'
            : undefined
      }
    >
      <View
        style={[styles.imageClip, { width: imageWidth, height: imageHeight }]}
      >
        <Image source={image} style={styles.image} resizeMode="cover" />
      </View>
      {reel.instagramAuthorUsername ? (
        <View style={styles.accountRow}>
          <InstagramIcon width={18} height={18} />
          <Text style={styles.account} numberOfLines={1}>
            @{reel.instagramAuthorUsername.replace(/^@/, '')}
          </Text>
        </View>
      ) : null}
      <Text
        style={styles.title}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {captionPreview}
      </Text>
    </Pressable>
  );
}

function PostState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { button } = useScreenAnalytics();

  return (
    <View style={styles.state}>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            button('retry_posts');
            onRetry();
          }}
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      ) : null}
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
  pressed: { opacity: 0.78 },
  imageClip: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#d9dce8',
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
    lineHeight: 20,
    color: '#8e8e93',
  },
  title: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  state: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 52,
  },
  stateMessage: { color: '#5f5f70', fontSize: 15, textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#DBE0F9',
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  retryText: { color: '#2a2a44', fontSize: 14, fontWeight: '700' },
});
