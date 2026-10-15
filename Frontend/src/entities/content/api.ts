import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';
import type {
  ContentType,
  SaveInstagramReelResponse,
  SaveSource,
  ReelProcessingStatus,
} from './types';
import {ReelApiError, type ReelErrorCode} from './errors';

const client = createSpringApiClient();
/** 상태 폴링은 공유 목록 첫 페이지(서버 기본 50건)에서 찾습니다. */
const SHARE_STATUS_PAGE_PATH = '/api/v1/shares';

export type SpringExtractionStatus = 'EXTRACTING' | 'SUCCEEDED' | 'FAILED';

type SpringShareResponse = {
  sharedMediaId: number;
  extractionStatus: SpringExtractionStatus;
};

type SpringShareHistoryItem = {
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

/** Spring 요청 실패를 화면이 쓰는 ReelApiError로 바꿉니다. 서버 errorCode와 문구는 유지합니다. */
export function toReelApiError(error: unknown): ReelApiError {
  if (error instanceof ReelApiError) return error;
  if (!(error instanceof ApiError)) {
    return new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
    });
  }

  if (error.status === 401 || error.kind === 'auth') {
    return new ReelApiError({
      errorCode: 'AUTH401_001',
      message: '로그인이 필요해요.',
      status: 401,
    });
  }
  if (error.kind === 'timeout') {
    return new ReelApiError({
      errorCode: 'CLIENT000_002',
      message: '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      retryable: true,
    });
  }
  if (error.kind === 'network' || error.kind === 'cancelled') {
    return new ReelApiError({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
    });
  }
  if (error.kind === 'http') {
    const status = error.status ?? null;
    const serverError = status !== null && status >= 500;
    return new ReelApiError({
      errorCode: (error.errorCode ??
        (serverError ? 'COMMON500_001' : 'COMMON400_001')) as ReelErrorCode,
      message: error.message,
      retryable: serverError || status === 429,
      status,
      ...(error.errorCode?.startsWith('MEDIA400_') ? {field: 'instagramUrl'} : {}),
    });
  }
  return new ReelApiError({
    errorCode: 'CLIENT000_003',
    message: '응답을 처리하지 못했어요.',
  });
}

export function detectContentType(url: string): ContentType {
  return normalizeInstagramContentUrl(url) ? 'instagram_reel' : 'unsupported';
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

/**
 * 링크를 서버에 공유합니다. 서버에는 멱등키가 없어 매 요청마다 새 공유가 생기므로
 * source와 clientRequestId는 화면 호환을 위해서만 받고 보내지 않습니다.
 */
export async function saveInstagramReel(
  instagramUrl: string,
  _source: SaveSource,
  _clientRequestId?: string,
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
  source: SaveSource,
  clientRequestId?: string,
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

  return saveInstagramReel(normalizedUrl, source, clientRequestId);
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

/** 현재 로그인한 사용자의 최신 처리중 릴스를 복원합니다. */
export async function getLatestProcessingReel(): Promise<ReelProcessingStatus | null> {
  const shares = await getRecentShares();
  const item = shares.find(share => share.extractionStatus === 'EXTRACTING');
  return item ? toReelProcessingStatus(item) : null;
}
