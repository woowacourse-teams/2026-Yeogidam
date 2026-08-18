import React, { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import InstagramIcon from '../../../assets/icons/social/instagram.svg';
import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';

type PlacePostGridProps = {
  reels: PlaceReel[];
  error?: PlaceReelsApiError | null;
  isLoading?: boolean;
  onRetry?: () => void;
};

const GRID_HORIZONTAL_PADDING = 12;
const COLUMN_GAP = 10;
const CAPTION_QUOTE_PATTERN = /["“”＂]/;

export function PlacePostGrid({
  reels,
  error,
  isLoading = false,
  onRetry,
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
    return <PostState message="아직 관련 릴스가 없어요." />;
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
                <PostCard key={reel.id} reel={reel} imageWidth={columnWidth} />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

function getCaptionPreview(
  description?: string | null,
  fallback?: string,
): string {
  if (!description) return fallback ?? '';

  const normalized = description.replace(/\r\n/g, '\n').trim();
  const quoteMatch = normalized.match(CAPTION_QUOTE_PATTERN);
  const content = quoteMatch
    ? normalized.slice((quoteMatch.index ?? -1) + 1)
    : normalized;
  const firstLine = content.split('\n')[0]?.trim();

  return firstLine || fallback || '';
}

function PostCard({
  reel,
  imageWidth,
}: {
  reel: PlaceReel;
  imageWidth: number;
}) {
  const image = reel.instagramThumbnailUrl
    ? { uri: reel.instagramThumbnailUrl }
    : require('../../../assets/illustrations/empty-illustration.png');
  const asset = Image.resolveAssetSource(image);
  const imageHeight =
    imageWidth *
    (asset.width && asset.height ? asset.height / asset.width : 1.25);
  const captionPreview = getCaptionPreview(
    reel.instagramDescription,
    reel.id,
  );

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => {
        if (reel.instagramUrl) {
          Linking.openURL(reel.instagramUrl);
        }
      }}
      disabled={!reel.instagramUrl}
      accessibilityRole={reel.instagramUrl ? 'link' : undefined}
      accessibilityLabel={reel.instagramUrl ? 'Instagram 릴스 열기' : undefined}
    >
      <View
        style={[styles.imageClip, { width: imageWidth, height: imageHeight }]}
      >
        <Image source={image} style={styles.image} resizeMode="cover" />
      </View>
      {reel.instagramAuthorUsername ? (
        <View style={styles.accountRow}>
          <InstagramIcon width={18} height={18} opacity={0.45} />
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
  return (
    <View style={styles.state}>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
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
