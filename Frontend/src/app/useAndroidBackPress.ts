import {useEffect, useRef} from 'react';
import {BackHandler, Platform} from 'react-native';

/**
 * Android 시스템 뒤로 가기(버튼과 제스처)를 앱의 화면 이력에 연결합니다.
 * onBackPress가 true를 돌려주면 앱이 처리한 것이고, false면 시스템이 앱을 닫습니다.
 * 가장 최근 렌더의 onBackPress를 ref로 읽으므로 구독은 한 번만 합니다.
 */
export function useAndroidBackPress(onBackPress: () => boolean) {
  const onBackPressRef = useRef(onBackPress);
  onBackPressRef.current = onBackPress;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      onBackPressRef.current(),
    );

    return () => subscription.remove();
  }, []);
}
