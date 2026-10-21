import React from 'react';

import { StepPager, type StepPage } from '../../components/StepPager';
import { SHARE_GUIDE_PAGE } from '../guide/AppGuideScreen';
import { PlacePreviewDemo } from './components/PlacePreviewDemo';

type OnboardingScreenProps = {
  onComplete: () => void;
};

const ONBOARDING_PAGES: StepPage[] = [
  SHARE_GUIDE_PAGE,
  {
    key: 'places',
    title: '여기담에서\n장소를 확인해요',
    renderMedia: frame => <PlacePreviewDemo {...frame} />,
  },
];

// 로그아웃 상태로 앱을 열면 로그인 화면 앞에 보여준다.
export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  return (
    <StepPager
      pages={ONBOARDING_PAGES}
      onComplete={onComplete}
      lastButtonLabel="시작하기"
    />
  );
}
