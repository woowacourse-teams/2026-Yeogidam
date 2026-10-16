import {ApiError} from '../../lib/api/errors';
import {createSpringApiClient} from '../../lib/api/spring-client';

const client = createSpringApiClient();
/** 공유 API의 경로입니다. 공유 저장, 공유 목록, 히스토리의 하위 요청이 함께 씁니다. */
export const SHARES_PATH = '/api/v1/shares';

export type SpringExtractionStatus = 'EXTRACTING' | 'SUCCEEDED' | 'FAILED';

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

/** 서버가 돌려주는 다음 쪽 커서입니다. 앱 커서(HistoryCursor)와 서로 바꾸는 일은 history-api가 합니다. */
export type SpringSharesCursor = {createdAt: string; id: number};

/**
 * 공유 목록 응답입니다. 서버가 목록을 빼거나 null로 보내도 requestSharesPage가 경계에서 막으므로
 * 받을 수 있는 모양대로 null을 허용해 적고, 확인을 거친 뒤에는 SpringSharesPage로 씁니다.
 */
type SpringSharesResponse = {
  sharedMedias: SpringShareHistoryItem[] | null;
  nextCursor: SpringSharesCursor | null;
};

/** requestSharesPage가 모양을 확인해 돌려주는 공유 목록 한 쪽입니다. */
export type SpringSharesPage = {
  sharedMedias: SpringShareHistoryItem[];
  nextCursor: SpringSharesCursor | null;
};

/**
 * 공유 목록 한 쪽을 읽습니다. 커서가 없으면 첫 쪽(서버 기본 50건)을 쿼리 없이 읽고, 커서는 서버 모양 그대로 받고 돌려줍니다.
 * 응답에 공유 목록 배열이 없거나 다음 커서 모양이 어긋나면 빈 목록이나 빈 커서로 보지 않고 응답 처리 오류(ApiError invalid_response)로 던집니다.
 * 빈 목록으로 보면 상태 확인은 공유를 찾지 못했다며 지우고, 온보딩 전환은 기존 회원을 새 회원으로 보기 때문입니다.
 * 요청 오류는 바꾸지 않고 날 ApiError로 던집니다. 공유 API의 화면 오류(ReelApiError)로 바꾸는 getSharesPage는 api.ts에 있고,
 * 온보딩 전환처럼 ApiError를 그대로 쓰는 곳만 이 함수를 직접 부릅니다.
 */
export async function requestSharesPage(cursor?: SpringSharesCursor): Promise<SpringSharesPage> {
  const response = cursor
    ? await client.request<SpringSharesResponse | null>(SHARES_PATH, {
        query: {cursorCreatedAt: cursor.createdAt, cursorId: String(cursor.id)},
      })
    : await client.request<SpringSharesResponse | null>(SHARES_PATH);
  if (!response || !Array.isArray(response.sharedMedias) || !isSharesCursorOrNull(response.nextCursor)) {
    throw new ApiError({kind: 'invalid_response', message: '공유 목록 응답을 처리하지 못했어요.'});
  }
  return {sharedMedias: response.sharedMedias, nextCursor: response.nextCursor ?? null};
}

/** 다음 커서가 없거나(null이나 생략) 서버 모양(createdAt 문자열, id 숫자)인지 확인합니다. */
function isSharesCursorOrNull(cursor: unknown): cursor is SpringSharesCursor | null | undefined {
  if (cursor == null) return true;
  if (typeof cursor !== 'object') return false;
  const {createdAt, id} = cursor as Partial<SpringSharesCursor>;
  return typeof createdAt === 'string' && typeof id === 'number';
}
