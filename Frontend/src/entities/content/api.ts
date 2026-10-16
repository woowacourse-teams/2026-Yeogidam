import {ApiError} from '../../lib/api/errors';
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
  HistoryCursor,
  SaveInstagramReelResponse,
  ReelProcessingStatus,
} from './types';
import {ReelApiError} from './errors';

const client = createSpringApiClient();
/** 공유 API의 경로입니다. 공유 저장, 공유 목록, 히스토리의 하위 요청이 함께 씁니다. */
export const SHARES_PATH = '/api/v1/shares';

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

/**
 * 공유 목록 응답입니다. 서버가 목록을 빼거나 null로 보내도 requestSharesPage가 경계에서 막으므로
 * 받을 수 있는 모양대로 null을 허용해 적고, 확인을 거친 뒤에는 SpringSharesPage로 씁니다.
 */
type SpringSharesResponse = {
  sharedMedias: SpringShareHistoryItem[] | null;
  nextCursor: {createdAt: string; id: number} | null;
};

/** requestSharesPage가 모양을 확인해 돌려주는 공유 목록 한 쪽입니다. */
export type SpringSharesPage = {
  sharedMedias: SpringShareHistoryItem[];
  nextCursor: SpringSharesResponse['nextCursor'];
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
    response = await client.request<SpringShareResponse>(SHARES_PATH, {
      method: 'POST',
      body: {instagramUrl},
    });
  } catch (error) {
    throw toReelApiError(error);
  }

  if (response?.sharedMediaId == null || !response.extractionStatus) {
    throw new ReelApiError({...PROCESSING_ERROR});
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

/**
 * 공유 목록 한 쪽을 읽습니다. 커서가 없으면 첫 쪽(서버 기본 50건)을 쿼리 없이 읽습니다.
 * 응답에 공유 목록 배열이 없으면 빈 목록으로 보지 않고 응답 처리 오류(ApiError invalid_response)로 던집니다.
 * 빈 목록으로 보면 상태 확인은 공유를 찾지 못했다며 지우고, 온보딩 전환은 기존 회원을 새 회원으로 보기 때문입니다.
 * 요청 오류는 바꾸지 않고 던지므로, 화면 오류로 바꾸는 일은 부르는 쪽의 표가 맡습니다.
 */
export async function requestSharesPage(cursor?: HistoryCursor): Promise<SpringSharesPage> {
  const response = cursor
    ? await client.request<SpringSharesResponse | null>(SHARES_PATH, {
        query: {cursorCreatedAt: cursor.created_at, cursorId: cursor.id},
      })
    : await client.request<SpringSharesResponse | null>(SHARES_PATH);
  if (!response || !Array.isArray(response.sharedMedias)) {
    throw new ApiError({kind: 'invalid_response', message: '공유 목록 응답을 처리하지 못했어요.'});
  }
  return {sharedMedias: response.sharedMedias, nextCursor: response.nextCursor ?? null};
}

/**
 * 서버에 단건 상태 조회 API가 없어 최근 공유 목록 첫 쪽에서 찾습니다.
 * 목록에 없으면 null을 돌려주고, 응답에 공유 목록이 없으면 응답 처리 오류(CLIENT000_003)로 던집니다.
 */
export async function getReelProcessingStatus(
  reelId: string,
): Promise<ReelProcessingStatus | null> {
  let page: SpringSharesPage;
  try {
    page = await requestSharesPage();
  } catch (error) {
    throw toReelApiError(error);
  }
  const item = page.sharedMedias.find(share => String(share.sharedMediaId) === reelId);
  return item ? toReelProcessingStatus(item) : null;
}
