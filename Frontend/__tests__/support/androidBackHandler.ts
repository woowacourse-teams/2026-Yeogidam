import {BackHandler, Platform} from 'react-native';

type BackPressHandler = Parameters<typeof BackHandler.addEventListener>[1];
type BackPressEvent = Parameters<BackPressHandler>[0];

/**
 * Platform.OS를 Android로 바꾸고, App과 화면이 BackHandler에 거는 hardwareBackPress 처리기를 모아 둡니다.
 * 테스트 환경의 BackHandler는 iOS 구현이라 처리기를 저장하지 않으므로 여기서 대신 저장합니다.
 * App을 그리기 전에 불러야 App의 처리기도 잡힙니다. 되돌리기는 돌려주는 restore를 부르거나, 테스트 파일의
 * afterEach에서 jest.restoreAllMocks()가 맡습니다.
 */
export function mockAndroidBackHandler() {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  const handlers: BackPressHandler[] = [];
  const addEventListener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_eventName, handler) => {
      handlers.push(handler);
      return {
        remove: () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
        },
      };
    });

  /** 시스템 뒤로 가기를 누릅니다. RN BackHandler처럼 마지막에 건 처리기부터 부르고, 하나라도 가로챘으면(true) 멈추고 true입니다. */
  const pressBack = () =>
    [...handlers].reverse().some(handler => handler({} as BackPressEvent) === true);

  const restore = () => {
    addEventListener.mockRestore();
    platform.restore();
  };

  return {handlers, pressBack, restore};
}
