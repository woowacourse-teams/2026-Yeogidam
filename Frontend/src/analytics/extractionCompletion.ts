import AsyncStorage from '@react-native-async-storage/async-storage';

import {capture, type AnalyticsClient} from './analytics';
import {ANALYTICS_EVENTS} from './eventNames';
import type {HistoryReel} from '../entities/content/types';

const STORAGE_PREFIX = 'analytics.extraction_results_reported.v1:';
/** 기기에 기억해 둘 보고한 공유 ID 수입니다. 공유 목록 첫 페이지보다 넉넉하면 됩니다. */
const MAX_REMEMBERED_IDS = 300;
/** 처음 실행할 때 이보다 오래된 공유는 이미 끝난 것으로 보고 건너뜁니다. */
const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type ExtractionResultDeps = {
  client: AnalyticsClient | null | undefined;
  memberId: string | null;
  /** 완료된 공유에서 찾은 장소 수를 읽습니다. 실패하면 장소 수 없이 보냅니다. */
  getPlaceCount: (reelId: string) => Promise<number>;
  storage?: KeyValueStorage;
  now?: () => number;
};

function readIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** `AUTH401_001 | 메시지 | HTTP_401`처럼 앞에 붙은 오류 코드만 꺼냅니다. 자유 문구는 보내지 않습니다. */
function toFailureType(failureReason: string | null): string | null {
  const code = failureReason?.trim().match(/^[A-Z][A-Z0-9]*_[A-Z0-9_]+/)?.[0];
  return code ?? null;
}

function isFinished(reel: HistoryReel) {
  return reel.processing_status === 'COMPLETED' || reel.processing_status === 'FAILED';
}

let queue: Promise<void> = Promise.resolve();

/**
 * 공유 목록에서 처음 보는 완료·실패 공유마다 `extraction_completed`를 한 번 보냅니다.
 *
 * 서버가 처리 완료를 직접 기록하지 않아, 앱이 공유 목록을 받을 때 상태가 끝난 건을 골라 대신 남깁니다.
 * 그래서 앱이 꺼져 있는 동안 끝난 공유는 다음에 앱을 열어 목록을 받을 때 기록되고,
 * `minutes_since_share`는 완료 시각이 아니라 앱이 결과를 확인한 시각까지의 시간입니다.
 *
 * 보낸 공유 ID는 회원별로 기기에 기억해 다시 보내지 않습니다. 이 기능이 처음 도는 회원은
 * 24시간보다 오래된 공유를 이미 끝난 것으로 표시만 하고 보내지 않아, 과거 이력이 한꺼번에 몰리지 않습니다.
 * 여러 화면이 같은 결과를 동시에 넘겨도 순서대로 처리해 중복으로 보내지 않습니다.
 */
export function reportExtractionResults(
  reels: HistoryReel[],
  deps: ExtractionResultDeps,
): Promise<void> {
  queue = queue.then(() => run(reels, deps)).catch(() => undefined);
  return queue;
}

async function run(reels: HistoryReel[], deps: ExtractionResultDeps) {
  const {client, memberId, getPlaceCount, storage = AsyncStorage, now = Date.now} = deps;
  if (!client || !memberId) return;

  const finished = reels.filter(isFinished);
  if (finished.length === 0) return;

  const key = `${STORAGE_PREFIX}${memberId}`;
  const raw = await storage.getItem(key);
  const remembered = raw === null ? [] : readIds(raw);
  const known = new Set(remembered);
  const at = now();

  const fresh: HistoryReel[] = [];
  const skipped: string[] = [];
  for (const reel of finished) {
    if (known.has(reel.id)) continue;
    const createdAt = Date.parse(reel.created_at);
    const isOld = Number.isFinite(createdAt) && at - createdAt > BACKFILL_WINDOW_MS;
    if (raw === null && isOld) skipped.push(reel.id);
    else fresh.push(reel);
  }
  if (fresh.length === 0 && skipped.length === 0) return;

  // 보내기 전에 먼저 기억해, 보내는 도중 앱이 꺼져도 다음에 같은 건을 다시 보내지 않습니다.
  const next = [...fresh.map(reel => reel.id), ...skipped, ...remembered].slice(
    0,
    MAX_REMEMBERED_IDS,
  );
  await storage.setItem(key, JSON.stringify(next));

  for (const reel of fresh) {
    const completed = reel.processing_status === 'COMPLETED';
    let placeCount: number | null = null;
    if (completed) {
      placeCount = await getPlaceCount(reel.id).catch(() => null);
    }
    const createdAt = Date.parse(reel.created_at);
    const failureType = completed ? null : toFailureType(reel.failure_reason);
    capture(client, ANALYTICS_EVENTS.extractionCompleted, {
      content_id: reel.id,
      result: completed ? 'success' : 'failed',
      place_count: placeCount,
      has_places: placeCount === null ? null : placeCount > 0,
      minutes_since_share: Number.isFinite(createdAt)
        ? Math.max(0, Math.round((at - createdAt) / 60000))
        : null,
      ...(failureType ? {failure_type: failureType} : {}),
    });
  }
}
