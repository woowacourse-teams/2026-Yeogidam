import {Alert, Linking} from 'react-native';
import Config from 'react-native-config';

const KAKAO_CHANNEL_HOST = 'pf.kakao.com';

function firstNonEmptyString(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function ensureHttpsUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value.replace(/^\/+/, '')}`;
}

function normalizeChannelPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '');

  if (!normalizedPath || normalizedPath === '/') {
    return null;
  }

  return normalizedPath.replace(/\/chat$/i, '');
}

function createKakaoChannelChatUrl() {
  const configuredUrl = firstNonEmptyString(
    Config.KAKAO_CHANNEL_CHAT_URL,
    Config.KAKAO_CHANNEL_URL,
  );

  if (configuredUrl) {
    try {
      const url = new URL(ensureHttpsUrl(configuredUrl));

      if (url.hostname === KAKAO_CHANNEL_HOST) {
        const pathname = normalizeChannelPath(url.pathname);

        if (!pathname) {
          return null;
        }

        url.pathname = pathname;
      }

      url.search = '';
      url.hash = '';

      return url.toString();
    } catch {
      return null;
    }
  }

  const channelPublicId = firstNonEmptyString(Config.KAKAO_CHANNEL_PUBLIC_ID);
  if (!channelPublicId) {
    return null;
  }

  const normalizedPublicId = channelPublicId.startsWith('_')
    ? channelPublicId
    : `_${channelPublicId}`;

  return `https://${KAKAO_CHANNEL_HOST}/${normalizedPublicId}`;
}

export async function openKakaoChannelChat() {
  const chatUrl = createKakaoChannelChatUrl();

  if (!chatUrl) {
    Alert.alert(
      '문의 채널 준비 중',
      '카카오톡 문의 채널 설정이 아직 완료되지 않았어요. 잠시 후 다시 시도해주세요.',
    );
    return;
  }

  try {
    await Linking.openURL(chatUrl);
  } catch {
    Alert.alert(
      '문의 연결 실패',
      '카카오톡 문의 화면을 열지 못했어요. 잠시 후 다시 시도해주세요.',
    );
  }
}
