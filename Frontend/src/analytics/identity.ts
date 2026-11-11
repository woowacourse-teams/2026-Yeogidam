import AsyncStorage from '@react-native-async-storage/async-storage';

const IDENTIFIED_MEMBER_KEY = '@yeogidam/analytics/identified-member';

/** PostHog 식별에 필요한 최소 인터페이스입니다. */
export type IdentityClient = {
  identify: (distinctId: string) => void;
  reset: () => void;
};

export type IdentityStorage = {
  get: () => Promise<string | null>;
  set: (memberId: string) => Promise<void>;
};

export const identityStorage: IdentityStorage = {
  async get() {
    try {
      return await AsyncStorage.getItem(IDENTIFIED_MEMBER_KEY);
    } catch {
      return null;
    }
  },
  async set(memberId) {
    try {
      await AsyncStorage.setItem(IDENTIFIED_MEMBER_KEY, memberId);
    } catch {
      // 저장하지 못해도 이번 식별은 그대로 유효합니다.
    }
  },
};

/**
 * 회원으로 식별합니다. 이 기기에서 마지막으로 식별한 회원과 다를 때만
 * 익명 ID를 새로 만들어, 다른 사람의 기록이 섞이지 않게 합니다.
 */
export async function identifyMember(
  client: IdentityClient,
  memberId: string,
  storage: IdentityStorage = identityStorage,
) {
  const lastMemberId = await storage.get();
  if (lastMemberId && lastMemberId !== memberId) client.reset();
  client.identify(memberId);
  await storage.set(memberId);
}

/*
 * 로그아웃(세션 만료 포함) 때는 reset()을 부르지 않습니다. 부르면 같은 기기가
 * 새 익명 사용자로 한 번 더 집계됩니다. 로그아웃 뒤 이벤트는 is_guest로 구분합니다.
 */
