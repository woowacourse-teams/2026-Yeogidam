import type {ReelApiError} from '../../src/entities/content/errors';
import {ApiError} from '../../src/lib/api/errors';

// 공유 API 테스트(contentSaveApi, historyApi)가 함께 쓰는 실패 입력과 화면 오류 필드입니다.

/** 화면이 읽는 오류 필드입니다. 클래스(ReelApiError)는 테스트가 따로 봅니다. */
type ReelErrorFields = Pick<
  ReelApiError,
  'status' | 'errorCode' | 'message' | 'retryable' | 'field'
>;

/**
 * 공유 API 요청이 실패한 경우와 공유 API 오류 표(toReelApiError)를 거친 화면 오류 필드입니다.
 * 연결 실패와 토큰 실패는 전송 계층 문구를 고정 문구와 다르게 두어, 기본 오류 표(SCREEN_ERROR_TABLE)로 바꾸는 구현과 가립니다.
 */
export const REEL_REQUEST_ERRORS: Array<[string, ApiError, ReelErrorFields]> = [
  [
    '연결 실패',
    new ApiError({kind: 'network', message: 'offline'}),
    {
      status: null,
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
      field: undefined,
    },
  ],
  [
    '코드 없는 서버 오류(500)',
    new ApiError({
      kind: 'http',
      status: 500,
      errorCode: null,
      message: '요청을 처리하지 못했어요.',
    }),
    {
      status: 500,
      errorCode: 'COMMON500_001',
      message: '요청을 처리하지 못했어요.',
      retryable: true,
      field: undefined,
    },
  ],
  [
    '서버의 로그인 필요(401)',
    new ApiError({
      kind: 'http',
      status: 401,
      errorCode: 'AUTH401_004',
      message: '로그인이 필요한 요청입니다.',
    }),
    {
      status: 401,
      errorCode: 'AUTH401_001',
      message: '로그인이 필요해요.',
      retryable: false,
      field: undefined,
    },
  ],
  [
    '토큰을 읽지 못한 인증 실패',
    new ApiError({kind: 'auth', message: '로그인 정보를 확인하지 못했어요.'}),
    {
      status: 401,
      errorCode: 'AUTH401_001',
      message: '로그인이 필요해요.',
      retryable: false,
      field: undefined,
    },
  ],
];

/** 공유를 접수한 응답(링크 저장, 추출 재시도)에서 화면이 쓸 값이 빠진 모양입니다. */
export const MALFORMED_ACCEPTED_SHARE_BODIES: Array<[string, unknown]> = [
  ['본문이 비어 있으면', undefined],
  ['공유 ID가 없으면', {extractionStatus: 'EXTRACTING'}],
  ['추출 상태가 없으면', {sharedMediaId: 12}],
];

/** 응답 처리 오류(CLIENT000_003)의 화면 오류 필드입니다. */
export const PROCESSING_ERROR_FIELDS: ReelErrorFields = {
  status: null,
  errorCode: 'CLIENT000_003',
  message: '응답을 처리하지 못했어요.',
  retryable: false,
  field: undefined,
};
