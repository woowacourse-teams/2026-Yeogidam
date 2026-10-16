import AsyncStorage from '@react-native-async-storage/async-storage';

import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {Place} from '../place/types';
import {ONBOARDING_PLACES} from './data';

const STORAGE_KEY = '@yeogidam/guest-onboarding-transfer';
const client = createSpringApiClient();

type TransferRecord = {
  startedAt: number;
  /** 새 회원으로 확인해 이전 대상으로 정한 회원 ID입니다. */
  memberId?: string;
  /** 로그인을 시작할 때 비회원 보관함에 남아 있던 장소입니다. 이전 버전 기록에는 없습니다. */
  kakaoPlaceIds?: string[];
};

/** 장소 목록에서 카카오 장소 ID만 모읍니다. */
export function toOnboardingKakaoPlaceIds(places: Place[]): string[] {
  return places.flatMap(place => (place.kakaoPlaceId ? [place.kakaoPlaceId] : []));
}

let activeTransfer: {memberId: string; promise: Promise<boolean>} | null = null;

async function readRecord(): Promise<TransferRecord | null> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  if (!value) return null;

  try {
    const record = JSON.parse(value) as TransferRecord;
    if (!Number.isFinite(record.startedAt)) return null;
    if (record.kakaoPlaceIds !== undefined && !Array.isArray(record.kakaoPlaceIds)) {
      return {...record, kakaoPlaceIds: undefined};
    }
    return record;
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

/**
 * 비회원이 로그인을 시작할 때 그때 보관함에 남아 있던 장소를 기록합니다.
 * 로그인한 회원이 새 회원이면 기록한 장소만 옮깁니다.
 */
export function beginGuestOnboardingTransfer(kakaoPlaceIds: string[]): Promise<void> {
  return writeRecord({startedAt: Date.now(), kakaoPlaceIds});
}

export async function cancelGuestOnboardingTransfer(): Promise<void> {
  const record = await readRecord();
  if (record && !record.memberId) {
    await clearRecord();
  }
}

/**
 * 로그인 응답에 isNewMember가 없을 때(필드 추가 전 서버)만 씁니다. 공유 이력이 하나도 없는
 * 회원을 새 회원으로 봅니다. 공유한 적 없는 기존 회원도 새 회원으로 잡히는 한계가 있습니다.
 */
async function hasNoShareHistory(): Promise<boolean> {
  const response = await client.request<{sharedMedias: unknown[] | null}>(
    '/api/v1/shares',
  );
  // 모양이 어긋난 응답을 이력 없음으로 보면 기존 회원에게 온보딩 장소를 보내게 되므로, 다른 공유 목록 호출처처럼 오류로 받습니다.
  if (!Array.isArray(response?.sharedMedias)) {
    throw new ApiError({kind: 'invalid_response', message: '공유 목록 응답을 처리하지 못했어요.'});
  }
  return response.sharedMedias.length === 0;
}

/** 다시 보내도 결과가 같지 않은 요청 오류(앱 번들과 서버 시드 불일치 등)인지 확인합니다. */
function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 400
  );
}

async function transfer(memberId: string, isNewMember?: boolean): Promise<boolean> {
  let record = await readRecord();
  if (!record) return false;
  if (record.memberId && record.memberId !== memberId) return false;

  const kakaoPlaceIds =
    record.kakaoPlaceIds ?? toOnboardingKakaoPlaceIds(ONBOARDING_PLACES);
  // 비회원이 장소를 모두 지웠으면 옮길 것이 없습니다.
  if (kakaoPlaceIds.length === 0) {
    await clearRecord();
    return false;
  }

  if (!record.memberId) {
    // 로그인 응답의 isNewMember로 정합니다. 이 필드를 내리기 전 서버면 공유 이력으로 추측합니다.
    const isNew = isNewMember ?? (await hasNoShareHistory());
    if (!isNew) {
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
      body: {kakaoPlaceIds},
    });
  } catch (error) {
    if (isPermanentFailure(error)) await clearRecord();
    throw error;
  }

  await clearRecord();
  return true;
}

/**
 * 옮겼으면 true를 돌려줍니다. 화면은 이때 회원 데이터를 다시 읽습니다.
 * isNewMember는 로그인 직후에만 넘깁니다. 한 번 새 회원으로 정하면 기록에 회원 ID를 남겨
 * 실패 후 다시 보낼 때는 다시 판별하지 않습니다(이관 API는 회원마다 멱등).
 */
export function resumeGuestOnboardingTransfer(
  memberId: string,
  isNewMember?: boolean,
): Promise<boolean> {
  if (activeTransfer) {
    return activeTransfer.memberId === memberId
      ? activeTransfer.promise
      : Promise.resolve(false);
  }

  const promise = transfer(memberId, isNewMember).finally(() => {
    if (activeTransfer?.promise === promise) activeTransfer = null;
  });
  activeTransfer = {memberId, promise};
  return promise;
}
