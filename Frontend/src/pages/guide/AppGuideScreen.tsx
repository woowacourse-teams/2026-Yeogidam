import React from 'react';
import { Image, Platform } from 'react-native';

import { StepPager, type StepPage } from '../../components/StepPager';
import { PIN_FLOW_MEDIA, SHARE_FLOW_MEDIA } from './guideMedia';

type AppGuideScreenProps = {
  onComplete: () => void;
};

export const SHARE_GUIDE_PAGE: StepPage = {
  key: 'share',
  title: '저장하고 싶은 콘텐츠를\n공유해 보세요',
  renderMedia: frame => (
    <Image
      source={SHARE_FLOW_MEDIA}
      accessibilityLabel="게시물의 공유 버튼을 누르고 공유 목록에서 여기담을 선택하는 화면"
      resizeMode="cover"
      style={frame}
    />
  ),
};

const GUIDE_PAGES: StepPage[] = [
  SHARE_GUIDE_PAGE,
  {
    key: 'favorite',
    eyebrow: '공유하기에서 여기담을 더 빠르게 찾고 싶다면?',
    title: '공유 즐겨찾기에\n여기담을 추가해 보세요!',
    renderMedia: frame => (
      <Image
        source={PIN_FLOW_MEDIA}
        accessibilityLabel={Platform.select({
          ios: '공유 목록의 더보기에서 편집을 눌러 여기담을 즐겨찾기에 추가하는 화면',
          default: '공유 목록에서 여기담을 길게 눌러 고정하는 화면',
        })}
        resizeMode="cover"
        style={frame}
      />
    ),
  },
];

export function AppGuideScreen({ onComplete }: AppGuideScreenProps) {
  return (
    <StepPager
      pages={GUIDE_PAGES}
      onComplete={onComplete}
      showPrevious
      lastButtonAccessibilityLabel="가이드 마치기"
    />
  );
}
