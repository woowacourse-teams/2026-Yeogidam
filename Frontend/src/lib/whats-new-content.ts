import type {ComponentProps} from 'react';
import type {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export type WhatsNewItem = {
  icon: IconName;
  // 아이콘 색입니다. 타일 배경은 같은 계열의 옅은 색으로 자동 지정됩니다.
  color: string;
  title: string;
  description: string;
};

// 업데이트 후 한 번 보여주는 "새로운 소식" 안내입니다.
// OTA로 배포하므로 앱 버전·빌드 번호와 무관하게 id로 구분합니다.
// 새 소식을 알리려면 id와 내용을 함께 바꾸세요. 같은 id는 기기마다 한 번만 보여주고, 새 id가 들어오면 다시 보여줍니다.
// items를 비우면 안내를 띄우지 않습니다.
export const WHATS_NEW: {
  id: string;
  title: string;
  confirmLabel: string;
  items: readonly WhatsNewItem[];
} = {
  id: 'world-map-2026-11',
  title: '여기담 지도가\n세계로 넓어졌어요',
  confirmLabel: '확인했어요',
  items: [
    {
      icon: 'public',
      color: '#0A84FF',
      title: '세계지도로 확장',
      description: '해외 장소도 찾아볼 수 있어요.',
    },
    {
      icon: 'map',
      color: '#2FB26B',
      title: 'Google 지도 적용',
      description: '지도가 Google 지도로 바뀌었어요.',
    },
  ],
};
