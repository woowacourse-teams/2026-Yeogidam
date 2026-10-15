import AsyncStorage from '@react-native-async-storage/async-storage';

import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';
import {ONBOARDING_PLACES} from './data';

const STORAGE_KEY = '@yeogidam/guest-onboarding-transfer';
const client = createSpringApiClient();

type TransferRecord = {
  startedAt: number;
  /** 새 회원으로 확인해 이전 대상으로 정한 회원 ID입니다. */
  memberId?: string;
};

let activeTransfer: {memberId: string; promise: Promise<boolean>} | null = null;

async function readRecord(): Promise<TransferRecord | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return null;

  try {
    const record = JSON.parse(value) as TransferRecord;
    return Number.isFinite(record.startedAt) ? record : null;
  } catch {
    return null;
  }
}

function writeRecord(record: TransferRecord): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function clearRecord(): Promise<void> {
  return AsyncStorage.removeItem(STORAGE_KEY);
}

/** 비회원이 로그인을 시작할 때 기록합니다. 로그인한 회원이 새 회원이면 온보딩 장소를 옮깁니다. */
export function beginGuestOnboardingTransfer(): Promise<void> {
  return writeRecord({startedAt: Date.now()});
}

export async function cancelGuestOnboardingTransfer(): Promise<void> {
  const record = await readRecord();
  if (record && !record.memberId) {
    await clearRecord();
  }
}

/**
 * 로그인 응답에 신규 가입 여부가 없어 공유 이력이 하나도 없는 회원을 새 회원으로 봅니다.
 * 기존 회원이 다시 로그인했을 때 온보딩 장소가 보관함에 섞이지 않게 합니다.
 */
async function isNewMember(): Promise<boolean> {
  const response = await client.request<{sharedMedias: unknown[] | null}>(
    '/api/v1/shares',
  );
  return (response?.sharedMedias ?? []).length === 0;
}

/** 다시 보내도 결과가 같지 않은 요청 오류(앱 번들과 서버 시드 불일치 등)인지 확인합니다. */
function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 400
  );
}

async function transfer(memberId: string): Promise<boolean> {
  let record = await readRecord();
  if (!record) return false;
  if (record.memberId && record.memberId !== memberId) return false;

  if (!record.memberId) {
    if (!(await isNewMember())) {
      await clearRecord();
      return false;
    }
    record = {...record, memberId};
    await writeRecord(record);
  }

  // 서버는 이미 옮긴 회원의 재요청에 같은 이력을 돌려주므로 실패하면 다음 실행 때 다시 보냅니다.
  try {
    await client.request<{sharedMediaId: number}>('/api/v1/onboarding/saved-places', {
      method: 'POST',
      body: {kakaoPlaceIds: ONBOARDING_PLACES.map(place => place.kakaoPlaceId)},
    });
  } catch (error) {
    if (isPermanentFailure(error)) await clearRecord();
    throw error;
  }

  await clearRecord();
  return true;
}

/** 옮겼으면 true를 돌려줍니다. 화면은 이때 회원 데이터를 다시 읽습니다. */
export function resumeGuestOnboardingTransfer(memberId: string): Promise<boolean> {
  if (activeTransfer) {
    return activeTransfer.memberId === memberId
      ? activeTransfer.promise
      : Promise.resolve(false);
  }

  const promise = transfer(memberId).finally(() => {
    if (activeTransfer?.promise === promise) activeTransfer = null;
  });
  activeTransfer = {memberId, promise};
  return promise;
}
