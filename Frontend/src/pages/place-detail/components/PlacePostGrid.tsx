import React, { useState, type ReactNode } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import InstagramIcon from '../../../assets/icons/place-detail/instagram-outline.svg';
import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import { normalizeReelTitle } from '../../../entities/content/title';
import { useScreenAnalytics } from '../../../analytics/uiEvents';
import {
  LIBRARY_GRID_GAP,
  LIBRARY_GUTTER,
} from '../../saved-places/components/libraryTheme';
import { PlaceTabEmptyState } from './PlaceTabEmptyState';

type PlacePostGridProps = {
  reels: PlaceReel[];
  error?: PlaceReelsApiError | null;
  isLoading?: boolean;
  onRetry?: () => void;
  /** 지정하면 게시물을 눌렀을 때 인스타그램 대신 앱 안의 게시물 상세로 이동합니다. */
  onOpenReel?: (reel: PlaceReel) => void;
};

// 사진을 불러오기 전 높이입니다. 가장 흔한 캐러셀 비율(4:5)로 두어 로드 후 움직임을 줄입니다.
const DEFAULT_POST_IMAGE_RATIO = 1.25;
// 릴스 하나가 화면을 너무 많이 차지하지 않도록 세로/가로 비율을 제한합니다.
const MAX_POST_IMAGE_RATIO = 1.4;

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
    (gridWidth - LIBRARY_GUTTER * 2 - LIBRARY_GRID_GAP) / 2;

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
                <PlaceReelCard
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

function PlaceReelCard({
  reel,
  imageWidth,
  onOpenReel,
}: {
  reel: PlaceReel;
  imageWidth: number;
  onOpenReel?: (reel: PlaceReel) => void;
}) {
  const { button } = useScreenAnalytics();

  return (
    <PostCard
      thumbnailUrl={reel.instagramThumbnailUrl}
      authorUsername={reel.instagramAuthorUsername}
      title={normalizeReelTitle(reel.instagramDescription, null)}
      imageWidth={imageWidth}
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
    />
  );
}

/** 장소 상세와 보관함이 함께 쓰는 게시물 카드입니다. 화면별 표시는 imageOverlay로 사진 위에 얹습니다. */
export function PostCard({
  thumbnailUrl,
  authorUsername,
  title,
  imageWidth,
  imageOverlay,
  ...pressableProps
}: {
  thumbnailUrl?: string | null;
  authorUsername?: string | null;
  title: string;
  imageWidth: number;
  imageOverlay?: ReactNode;
} & Pick<
  PressableProps,
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'disabled'
  | 'onLongPress'
  | 'onPress'
  | 'onPressIn'
>) {
  const image = thumbnailUrl
    ? { uri: thumbnailUrl }
    : require('../../../assets/illustrations/empty-illustration.png');
  // 인터넷 이미지는 불러온 뒤에야 크기를 알 수 있어 로드 시점에 비율을 맞춥니다.
  const [imageRatio, setImageRatio] = useState(DEFAULT_POST_IMAGE_RATIO);
  const imageHeight = imageWidth * imageRatio;

  return (
    <Pressable
      {...pressableProps}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View
        style={[styles.imageClip, { width: imageWidth, height: imageHeight }]}
      >
        <Image
          onLoad={event => {
            const { width, height } = event.nativeEvent.source;
            if (width > 0) {
              setImageRatio(Math.min(height / width, MAX_POST_IMAGE_RATIO));
            }
          }}
          source={image}
          style={styles.image}
          resizeMode="cover"
        />
        {imageOverlay}
      </View>
      {authorUsername ? (
        <View style={styles.accountRow}>
          <InstagramIcon width={18} height={18} />
          <Text style={styles.account} numberOfLines={1}>
            @{authorUsername.replace(/^@/, '')}
          </Text>
        </View>
      ) : null}
      <Text
        style={styles.title}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function PostState({
  message,
  onRetry,
  retryEventName = 'retry_posts',
}: {
  message: string;
  onRetry?: () => void;
  retryEventName?: string;
}) {
  const { button } = useScreenAnalytics();

  return (
    <View style={styles.state}>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            button(retryEventName);
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
    paddingHorizontal: LIBRARY_GUTTER,
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
    marginBottom: 22,
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
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  account: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#8e8e93',
  },
  title: {
    marginTop: 1,
    fontSize: 14,
    lineHeight: 20,
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
