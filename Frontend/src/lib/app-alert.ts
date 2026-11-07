import { Alert, Platform } from 'react-native';

type AlertArgs = Parameters<typeof Alert.alert>;
type AlertButton = NonNullable<AlertArgs[2]>[number];

export type AppAlertRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
};

const pendingAlerts: AppAlertRequest[] = [];
let listener: (() => void) | null = null;

export function subscribeAppAlerts(nextListener: () => void) {
  listener = nextListener;
  return () => {
    if (listener === nextListener) {
      listener = null;
      pendingAlerts.length = 0;
    }
  };
}

export function getCurrentAppAlert() {
  return pendingAlerts[0] ?? null;
}

export function dismissAppAlert(buttonIndex?: number) {
  const request = pendingAlerts.shift();
  listener?.();
  if (buttonIndex !== undefined) request?.buttons[buttonIndex]?.onPress?.();
}

// iOS 기본 Alert는 배경 터치 닫기를 지원하지 않아 앱 모달로 표시합니다.
// Android에서는 기본 Alert의 바깥쪽 터치 닫기 옵션을 켭니다.
export function showAlert(...args: Parameters<typeof Alert.alert>) {
  const [title, message, buttons, options] = args;
  if (Platform.OS === 'ios' && listener) {
    const nextButtons: AlertButton[] = buttons?.length ? buttons : [{ text: 'OK' }];
    const alreadyOpen = pendingAlerts.some(
      request =>
        request.title === title &&
        request.message === message &&
        request.buttons.length === nextButtons.length &&
        request.buttons.every(
          (button, index) =>
            button.text === nextButtons[index].text &&
            button.style === nextButtons[index].style,
        ),
    );
    if (alreadyOpen) return;
    pendingAlerts.push({ title, message, buttons: nextButtons });
    listener();
    return;
  }
  Alert.alert(title, message, buttons, { ...options, cancelable: true });
}
