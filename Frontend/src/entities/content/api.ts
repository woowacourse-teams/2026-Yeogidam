import {
  LOGIN_REQUIRED_ERROR,
  NETWORK_ERROR,
  PROCESSING_ERROR,
  SCREEN_ERROR_TABLE,
  TIMEOUT_ERROR,
  toScreenApiError,
  type ScreenErrorTable,
} from '../../lib/api/screen-error';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {
  SaveInstagramReelResponse,
  ReelProcessingStatus,
} from './types';
import {ReelApiError} from './errors';

const client = createSpringApiClient();
/** 상태 폴링은 공유 목록 첫 페이지(서버 기본 50건)에서 찾습니다. */
const SHARE_STATUS_PAGE_PATH = '/api/v1/shares';

export type SpringExtractionStatus = 'EXTRACTING' | 'SUCCEEDED' | 'FAILED';

type SpringShareResponse = {
  sharedMediaId: number;
  extractionStatus: SpringExtractionStatus;
};

export type SpringShareHistoryItem = {
  sharedMediaId: number;
  createdAt: string;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  extractionStatus: SpringExtractionStatus;
  failureReason: string | null;
  sharedUrl: string | null;
};

type SpringShareHistoryResponse = {
  sharedMedias: SpringShareHistoryItem[];
};

export function toReelStatus(
  status: SpringExtractionStatus | string,
): SaveInstagramReelResponse['status'] {
  switch (status) {
    case 'SUCCEEDED':
      return 'COMPLETED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}

/**
 * 공유 API의 오류 표입니다. 기본 표와 달리 토큰을 읽지 못한 경우도 401 로그인 필요로 보고,
 * 시간 초과와 연결 실패는 전송 계층 문구와 관계없이 늘 같은 문구로 알리며,
 * 응답을 읽지 못하면 상태를 남기지 않습니다.
 */
const REEL_ERROR_TABLE: ScreenErrorTable = {
  ...SCREEN_ERROR_TABLE,
  auth: () => ({...LOGIN_REQUIRED_ERROR}),
  timeout: () => ({...TIMEOUT_ERROR}),
  network: () => ({...NETWORK_ERROR}),
  invalid_response: () => ({...PROCESSING_ERROR}),
};

/** Spring 요청 실패를 화면이 쓰는 ReelApiError로 바꿉니다. 서버 errorCode와 문구는 유지합니다. */
export function toReelApiError(error: unknown): ReelApiError {
  const screenError = toScreenApiError(error, REEL_ERROR_TABLE);
  return new ReelApiError({
    ...screenError,
    ...(screenError.errorCode.startsWith('MEDIA400_')
      ? {field: 'instagramUrl'}
      : {}),
  });
}

export function normalizeInstagramContentUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url.trim());
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'instagram.com') return null;

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const contentIndex = pathParts.findIndex(
      part => part === 'reel' || part === 'p',
    );
    const shortcode = pathParts[contentIndex + 1];
    if (contentIndex < 0 || !shortcode) return null;

    return `https://www.instagram.com/${pathParts[contentIndex]}/${shortcode}/`;
  } catch {
    // The caller handles unsupported or malformed URLs uniformly.
  }

  return null;
}

/** 링크를 서버에 공유합니다. 서버에는 멱등키가 없어 매 요청마다 새 공유가 생깁니다. */
export async function saveInstagramReel(
  instagramUrl: string,
): Promise<SaveInstagramReelResponse> {
  let response: SpringShareResponse;
  try {
    response = await client.request<SpringShareResponse>('/api/v1/shares', {
      method: 'POST',
      body: {instagramUrl},
    });
  } catch (error) {
    throw toReelApiError(error);
  }

  if (response?.sharedMediaId == null || !response.extractionStatus) {
    throw new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
    });
  }

  return {
    reelId: String(response.sharedMediaId),
    status: toReelStatus(response.extractionStatus),
    reused: response.extractionStatus === 'SUCCEEDED',
  };
}

export async function saveContent(
  url: string,
): Promise<SaveInstagramReelResponse> {
  const normalizedUrl = normalizeInstagramContentUrl(url);

  if (!normalizedUrl) {
    throw new ReelApiError({
      errorCode: 'REEL400_001',
      message: '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.',
      retryable: false,
      field: 'instagramUrl',
    });
  }

  return saveInstagramReel(normalizedUrl);
}

function toReelProcessingStatus(item: SpringShareHistoryItem): ReelProcessingStatus {
  return {
    id: String(item.sharedMediaId),
    processing_status: toReelStatus(item.extractionStatus),
    failure_reason: item.failureReason,
    instagram_thumbnail_url: item.thumbnailUrl,
    created_at: item.createdAt,
  };
}

async function getRecentShares(): Promise<SpringShareHistoryItem[]> {
  try {
    const response = await client.request<SpringShareHistoryResponse>(
      SHARE_STATUS_PAGE_PATH,
    );
    return response?.sharedMedias ?? [];
  } catch (error) {
    throw toReelApiError(error);
  }
}

/**
 * 서버에 단건 상태 조회 API가 없어 최근 공유 목록 첫 페이지에서 찾습니다.
 * 목록에 없으면 null을 돌려줍니다.
 */
export async function getReelProcessingStatus(
  reelId: string,
): Promise<ReelProcessingStatus | null> {
  const shares = await getRecentShares();
  const item = shares.find(share => String(share.sharedMediaId) === reelId);
  return item ? toReelProcessingStatus(item) : null;
}
