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
import {
  SHARES_PATH,
  requestSharesPage,
  type SpringExtractionStatus,
  type SpringShareHistoryItem,
  type SpringSharesCursor,
  type SpringSharesPage,
} from './shares-request';
import type {SaveInstagramReelResponse, ReelProcessingStatus} from './types';
import {ReelApiError} from './errors';

const client = createSpringApiClient();

type SpringShareResponse = {
  sharedMediaId: number;
  extractionStatus: SpringExtractionStatus;
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

/**
 * 공유 API 요청을 실행하고, 요청이 실패하면 오류를 toReelApiError로 바꿔 던집니다.
 * run 안에서 던진 ReelApiError도 ApiError가 아니므로 응답 처리 오류(CLIENT000_003)로 바뀝니다.
 * 그래서 응답 모양 확인과 응답 변환은 감싸기 밖에 두어, 확인과 변환에서 난 오류가 다른 오류로 바뀌지 않게 합니다.
 */
export async function withReelError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw toReelApiError(error);
  }
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
  const response = await withReelError(() =>
    client.request<SpringShareResponse>(SHARES_PATH, {
      method: 'POST',
      body: {instagramUrl},
    }),
  );

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
 * 공유 목록 한 쪽을 읽고, 요청 오류와 응답 처리 오류를 이 모듈의 다른 함수와 같은 ReelApiError로 바꿔 던집니다.
 * 상태 확인과 히스토리가 함께 씁니다. 요청과 목록 배열 확인은 shares-request의 requestSharesPage가 맡습니다(이 폴더에서 request는
 * 날 ApiError, get은 ReelApiError). 다음 커서의 모양은 확인하지 않습니다(SpringSharesPage 설명 참고).
 */
export function getSharesPage(cursor?: SpringSharesCursor): Promise<SpringSharesPage> {
  return withReelError(() => requestSharesPage(cursor));
}

/**
 * 서버에 단건 상태 조회 API가 없어 최근 공유 목록 첫 쪽에서 찾습니다.
 * 목록에 없으면 null을 돌려주고, 응답에 공유 목록이 없으면 응답 처리 오류(CLIENT000_003)로 던집니다.
 * 다음 커서는 쓰지 않으므로 모양을 보지 않습니다.
 */
export async function getReelProcessingStatus(
  reelId: string,
): Promise<ReelProcessingStatus | null> {
  const page = await getSharesPage();
  const item = page.sharedMedias.find(share => String(share.sharedMediaId) === reelId);
  return item ? toReelProcessingStatus(item) : null;
}
