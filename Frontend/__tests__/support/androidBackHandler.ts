import {BackHandler, Platform} from 'react-native';

type BackPressHandler = Parameters<typeof BackHandler.addEventListener>[1];
type BackPressEvent = Parameters<BackPressHandler>[0];

/**
 * Platform.OS를 Android로 바꾸고, 화면이 BackHandler에 거는 hardwareBackPress 처리기를 모아 둡니다.
 * 테스트 환경의 BackHandler는 iOS 구현이라 처리기를 저장하지 않으므로 여기서 대신 저장합니다.
 * 되돌리기는 테스트 파일의 afterEach에서 jest.restoreAllMocks()가 맡습니다.
 */
export function mockAndroidBackHandler() {
  jest.replaceProperty(Platform, 'OS', 'android');
  const handlers: BackPressHandler[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_eventName, handler) => {
    handlers.push(handler);
    return {
      remove: () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      },
    };
  });

  /** 시스템 뒤로 가기를 누릅니다. 걸린 처리기 가운데 하나라도 가로챘으면(true) true입니다. */
  const pressBack = () => handlers.some(handler => handler({} as BackPressEvent) === true);

  return {handlers, pressBack};
}
