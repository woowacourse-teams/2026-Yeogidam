import React, { useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const GUIDE_PAGES = [
  require('../../assets/guide/1page.png'),
  require('../../assets/guide/2page.png'),
  require('../../assets/guide/3page.png'),
  require('../../assets/guide/4page.png'),
];

type AppGuideScreenProps = {
  onComplete: () => void;
  onClose?: () => void;
};

export function AppGuideScreen({
  onComplete,
  onClose,
}: AppGuideScreenProps) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<number>>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const isLastPage = currentPage === GUIDE_PAGES.length - 1;

  const handleNext = () => {
    if (isLastPage) {
      onComplete();
      return;
    }

    listRef.current?.scrollToIndex({ index: currentPage + 1, animated: true });
  };

  return (
    <View style={styles.container}>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사용 가이드 닫기"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.closeButtonPressed,
          ]}
        >
          <Text style={styles.closeButtonText}>닫기</Text>
        </Pressable>
      ) : null}
      <FlatList
        ref={listRef}
        data={GUIDE_PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyExtractor={(_, index) => `guide-page-${index}`}
        onMomentumScrollEnd={event => {
          setCurrentPage(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <Image source={item} resizeMode="contain" style={styles.image} />
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {GUIDE_PAGES.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, index === currentPage && styles.activeDot]}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLastPage ? '여기담 시작하기' : '다음 안내 보기'}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>
            {isLastPage ? '시작하기' : '다음'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 24,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  closeButtonPressed: {
    opacity: 0.65,
  },
  closeButtonText: {
    color: '#596275',
    fontSize: 15,
    fontWeight: '700',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 112,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footer: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    left: 24,
    gap: 18,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#d9def2',
  },
  activeDot: {
    width: 22,
    backgroundColor: '#aebcf6',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#141c2d',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
