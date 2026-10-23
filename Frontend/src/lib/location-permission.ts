import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Linking,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

const REQUESTED_KEY = 'location-permission-requested';
const permissions = [
  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
];
const listeners = new Set<(granted: boolean) => void>();
let pending: Promise<boolean> | null = null;
type IOSLocationStatus = 'notDetermined' | 'granted' | 'denied' | 'disabled';
const iosLocationPermission = NativeModules.LocationPermissionModule as
  | {
      getStatus: () => Promise<IOSLocationStatus>;
      requestPermission: () => Promise<IOSLocationStatus>;
    }
  | undefined;

function notifyPermission(granted: boolean) {
  listeners.forEach(listener => listener(granted));
}

function showSettingsAlert(disabled = false) {
  Alert.alert(
    '위치 권한이 필요해요',
    disabled
      ? '현재 위치를 표시하려면 iPhone 설정 > 개인정보 보호 및 보안 > 위치 서비스에서 위치 서비스를 켜 주세요.'
      : '주변 장소와 현재 위치를 지도에 표시하려면 설정에서 위치 권한을 허용해 주세요.',
    [
      { text: '취소', style: 'cancel' },
      {
        text: '설정 열기',
        onPress: () => {
          Linking.openSettings().catch(() =>
            Alert.alert(
              '설정을 열지 못했어요',
              '휴대폰 설정에서 여기담의 위치 권한을 허용해 주세요.',
            ),
          );
        },
      },
    ],
  );
}

export function subscribeLocationPermission(
  listener: (granted: boolean) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    if (!iosLocationPermission)
      throw new Error('iOS 위치 권한 모듈을 찾지 못했어요.');
    const granted = (await iosLocationPermission.getStatus()) === 'granted';
    notifyPermission(granted);
    return granted;
  }
  if (Platform.OS !== 'android') return false;
  const results = await Promise.all(
    permissions.map(p => PermissionsAndroid.check(p)),
  );
  const granted = results.some(Boolean);
  notifyPermission(granted);
  return granted;
}

export async function ensureLocationPermission(
  automatic = false,
): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    if (Platform.OS === 'ios') {
      if (!iosLocationPermission)
        throw new Error('iOS 위치 권한 모듈을 찾지 못했어요.');
      const status = await iosLocationPermission.getStatus();
      if (status === 'granted') {
        notifyPermission(true);
        return true;
      }
      if (status === 'notDetermined') {
        const granted =
          (await iosLocationPermission.requestPermission()) === 'granted';
        notifyPermission(granted);
        return granted;
      }
      notifyPermission(false);
      if (!automatic) showSettingsAlert(status === 'disabled');
      return false;
    }
    if (Platform.OS !== 'android') return false;
    if (await checkLocationPermission()) return true;
    if (automatic && (await AsyncStorage.getItem(REQUESTED_KEY))) return false;
    // Persist before opening the dialog so a restart does not automatically ask again.
    await AsyncStorage.setItem(REQUESTED_KEY, 'true');
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.some(
      p => results[p] === PermissionsAndroid.RESULTS.GRANTED,
    );
    notifyPermission(granted);
    if (
      !granted &&
      !automatic &&
      permissions.every(
        p => results[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      )
    ) {
      showSettingsAlert();
    }
    return granted;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
