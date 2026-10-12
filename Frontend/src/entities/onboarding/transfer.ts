import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Session, User} from '@supabase/supabase-js';

import {getReelProcessingStatus} from '../content/api';
import type {SaveInstagramReelResponse} from '../content/types';
import {supabase} from '../../lib/auth/supabase';
import {ONBOARDING_POST_URL} from './data';

const STORAGE_KEY = '@yeogidam/guest-onboarding-transfer';
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 30;
const NEW_ACCOUNT_WINDOW_MS = 30_000;

type TransferRecord = {
  startedAt: number;
  userId?: string;
  reelId?: string;
  requestStarted?: boolean;
};

let activeTransfer: {userId: string; promise: Promise<boolean>} | null = null;

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

function isNewAccount(user: User, startedAt: number): boolean {
  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = Date.parse(user.last_sign_in_at ?? '');
  if (!Number.isFinite(createdAt)) return false;

  if (Number.isFinite(lastSignInAt)) {
    return Math.abs(lastSignInAt - createdAt) <= NEW_ACCOUNT_WINDOW_MS;
  }

  // Some providers omit last_sign_in_at on the first sign-in.
  return createdAt >= startedAt - NEW_ACCOUNT_WINDOW_MS &&
    createdAt <= Date.now() + NEW_ACCOUNT_WINDOW_MS;
}

export function beginGuestOnboardingTransfer(): Promise<void> {
  return writeRecord({startedAt: Date.now()});
}

export async function cancelGuestOnboardingTransfer(): Promise<void> {
  const record = await readRecord();
  if (record && !record.userId) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

async function waitForExtraction(reelId: string): Promise<'COMPLETED' | 'FAILED' | 'PENDING'> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const reel = await getReelProcessingStatus(reelId);
    if (reel?.processing_status === 'COMPLETED') return 'COMPLETED';
    if (reel?.processing_status === 'FAILED') return 'FAILED';
    await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return 'PENDING';
}

async function transfer(session: Session): Promise<boolean> {
  let record = await readRecord();
  if (!record || (record.userId && record.userId !== session.user.id)) {
    return false;
  }

  if (!record.userId) {
    if (!isNewAccount(session.user, record.startedAt)) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return false;
    }
    record = {...record, userId: session.user.id};
    await writeRecord(record);
  }

  // The server may have accepted the request even when its response was lost.
  // Find that reel before sending the same post again on the next launch.
  if (record.requestStarted && !record.reelId) {
    const {data: existingReel, error} = await supabase
      .from('reels')
      .select('id,processing_status')
      .eq('instagram_url', ONBOARDING_POST_URL)
      .order('created_at', {ascending: false})
      .limit(1)
      .maybeSingle<{id: string; processing_status: string}>();
    if (error) throw error;
    if (existingReel && existingReel.processing_status !== 'FAILED') {
      record = {...record, reelId: existingReel.id};
      await writeRecord(record);
    }
  }

  if (record.reelId) {
    const status = await waitForExtraction(record.reelId);
    if (status === 'COMPLETED') await AsyncStorage.removeItem(STORAGE_KEY);
    if (status === 'FAILED') {
      await writeRecord({...record, reelId: undefined});
      throw new Error('군자역 게시물의 장소 추출에 실패했습니다.');
    }
    return status === 'COMPLETED';
  }

  record = {...record, requestStarted: true};
  await writeRecord(record);
  const {data, error} = await supabase.functions.invoke<SaveInstagramReelResponse>(
    'save-instagram-reel',
    {
      body: {
        instagramUrl: ONBOARDING_POST_URL,
        source: 'url_input',
        forceReprocess: false,
      },
    },
  );

  if (error) throw error;
  if (!data?.reelId || data.status === 'FAILED') {
    throw new Error('군자역 게시물을 저장하지 못했습니다.');
  }

  if (data.status === 'COMPLETED') {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return true;
  }

  await writeRecord({...record, reelId: data.reelId});
  const status = await waitForExtraction(data.reelId);
  if (status === 'COMPLETED') await AsyncStorage.removeItem(STORAGE_KEY);
  if (status === 'FAILED') {
    await writeRecord({...record, reelId: undefined});
    throw new Error('군자역 게시물의 장소 추출에 실패했습니다.');
  }
  return status === 'COMPLETED';
}

export function resumeGuestOnboardingTransfer(session: Session): Promise<boolean> {
  if (activeTransfer) {
    return activeTransfer.userId === session.user.id
      ? activeTransfer.promise
      : Promise.resolve(false);
  }

  const promise = transfer(session).finally(() => {
    if (activeTransfer?.promise === promise) activeTransfer = null;
  });
  activeTransfer = {userId: session.user.id, promise};
  return promise;
}
