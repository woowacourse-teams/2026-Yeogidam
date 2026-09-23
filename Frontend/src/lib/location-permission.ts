import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

const REQUESTED_KEY = 'location-permission-requested';
const permissions = [
  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
];
const listeners = new Set<(granted: boolean) => void>();
let pending: Promise<boolean> | null = null;

export function subscribeLocationPermission(
  listener: (granted: boolean) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function checkLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const results = await Promise.all(
    permissions.map(p => PermissionsAndroid.check(p)),
  );
  const granted = results.some(Boolean);
  listeners.forEach(listener => listener(granted));
  return granted;
}

export async function ensureLocationPermission(
  automatic = false,
): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (pending) return pending;
  pending = (async () => {
    if (await checkLocationPermission()) return true;
    if (automatic && (await AsyncStorage.getItem(REQUESTED_KEY))) return false;
    // Persist before opening the dialog so a restart does not automatically ask again.
    await AsyncStorage.setItem(REQUESTED_KEY, 'true');
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const granted = permissions.some(
      p => results[p] === PermissionsAndroid.RESULTS.GRANTED,
    );
    listeners.forEach(listener => listener(granted));
    if (
      !granted &&
      !automatic &&
      permissions.every(
        p => results[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      )
    ) {
      Alert.alert(
        '위치 권한이 필요해요',
        '주변 장소와 현재 위치를 지도에 표시하려면 설정에서 위치 권한을 허용해 주세요.',
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
    return granted;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
