import React from 'react';
import { Image, Platform } from 'react-native';

import { StepPager, type StepPage } from '../../components/StepPager';
import {
  PIN_FLOW_MEDIA,
  PIN_FLOW_POSTER,
  SHARE_FLOW_MEDIA,
  SHARE_FLOW_POSTER,
} from './guideMedia';

type AppGuideScreenProps = {
  onComplete: () => void;
  backRequest?: number;
};

export const SHARE_GUIDE_PAGE: StepPage = {
  key: 'share',
  title: '저장하고 싶은 콘텐츠를\n공유해 보세요',
  posterSource: SHARE_FLOW_POSTER,
  renderMedia: (frame, onLoad) => (
    <Image
      source={SHARE_FLOW_MEDIA}
      onLoad={onLoad}
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
    posterSource: PIN_FLOW_POSTER,
    renderMedia: (frame, onLoad) => (
      <Image
        source={PIN_FLOW_MEDIA}
        onLoad={onLoad}
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

export function AppGuideScreen({
  onComplete,
  backRequest,
}: AppGuideScreenProps) {
  return (
    <StepPager
      flowName="app_guide"
      pages={GUIDE_PAGES}
      onComplete={onComplete}
      backRequest={backRequest}
      onBackAtFirst={onComplete}
      showPrevious
      lastButtonAccessibilityLabel="가이드 마치기"
    />
  );
}
