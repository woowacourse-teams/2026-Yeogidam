import type {NativeShareResult} from '../src/lib/share-intent';
import {
  classifyShareResult,
  selectShareResult,
  shareResultKey,
} from '../src/lib/share-intent/select-share-result';

function result(overrides: Partial<NativeShareResult>): NativeShareResult {
  return {
    requestId: 'request-1',
    url: 'https://www.instagram.com/reel/abc/',
    status: 'PENDING',
    updatedAt: 1,
    ...overrides,
  };
}

const NONE_HANDLED: ReadonlySet<string> = new Set();

describe('selectShareResult', () => {
  test('가장 최근 결과가 비회원 로그인 유도면 그 결과를 고른다', () => {
    const results = [
      result({requestId: 'tracked', transferStatus: 'REQUESTING'}),
      result({requestId: 'guest', transferStatus: 'GUEST_LOGIN_PROMPT'}),
    ];

    expect(selectShareResult(results, 'tracked', NONE_HANDLED)?.requestId).toBe('guest');
  });

  test('화면이 추적 중인 요청이 있으면 그 결과를, 없으면 가장 최근 결과를 고른다', () => {
    const results = [
      result({requestId: 'tracked', transferStatus: 'REQUESTING'}),
      result({requestId: 'newer', transferStatus: 'QUEUED'}),
    ];

    expect(selectShareResult(results, 'tracked', NONE_HANDLED)?.requestId).toBe('tracked');
    expect(selectShareResult(results, 'missing', NONE_HANDLED)?.requestId).toBe('newer');
    expect(selectShareResult(results, undefined, NONE_HANDLED)?.requestId).toBe('newer');
    expect(selectShareResult([], undefined, NONE_HANDLED)).toBeUndefined();
  });

  test('아직 처리하지 않은 로그인 이동 결과는 추적 중인 요청과 가장 최근 결과보다 먼저 고른다', () => {
    const results = [
      result({requestId: 'handoff', transferStatus: 'LOGIN_HANDOFF', updatedAt: 2}),
      result({requestId: 'tracked', transferStatus: 'API_SUCCEEDED', reelId: 'reel', updatedAt: 3}),
      result({requestId: 'newer', transferStatus: 'QUEUED', updatedAt: 4}),
    ];

    expect(selectShareResult(results, 'tracked', NONE_HANDLED)?.requestId).toBe('handoff');
    expect(selectShareResult(results, undefined, NONE_HANDLED)?.requestId).toBe('handoff');
  });

  test('로그인 이동 결과가 여럿이면 가장 최근 것을 고르고, 이미 처리한 것은 건너뛴다', () => {
    const older = result({requestId: 'older', transferStatus: 'GUEST_LOGIN_PROMPT', updatedAt: 2});
    const latest = result({requestId: 'latest', transferStatus: 'LOGIN_HANDOFF', updatedAt: 3});
    const results = [
      older,
      result({requestId: 'tracked', transferStatus: 'API_SUCCEEDED', reelId: 'reel', updatedAt: 4}),
      latest,
    ];

    expect(selectShareResult(results, 'tracked', NONE_HANDLED)?.requestId).toBe('latest');
    expect(
      selectShareResult(results, 'tracked', new Set([shareResultKey(latest)]))?.requestId,
    ).toBe('older');
    // 로그인 이동 결과를 모두 처리했으면 열려 있던 공유 상태로 돌아간다.
    expect(
      selectShareResult(
        results,
        'tracked',
        new Set([shareResultKey(latest), shareResultKey(older)]),
      )?.requestId,
    ).toBe('tracked');
  });

  test('결과 키는 요청 ID와 갱신 시각으로, 요청 ID가 없으면 주소와 갱신 시각으로 만든다', () => {
    expect(shareResultKey(result({requestId: 'request-1', updatedAt: 7}))).toBe('request-1:7');
    expect(shareResultKey(result({requestId: undefined, updatedAt: 7}))).toBe(
      'https://www.instagram.com/reel/abc/:7',
    );
  });
});

describe('classifyShareResult', () => {
  test('전송 상태를 앱이 할 일로 바꾼다', () => {
    expect(classifyShareResult(result({transferStatus: 'GUEST_LOGIN_PROMPT'}))).toBe('guest-login-prompt');
    expect(classifyShareResult(result({transferStatus: 'GUEST_PREVIEW'}))).toBe('open-saved-places');
    expect(classifyShareResult(result({transferStatus: 'LOGIN_REQUIRED'}))).toBe('open-saved-places');
    expect(classifyShareResult(result({transferStatus: 'LOGIN_HANDOFF'}))).toBe('login-handoff');
    expect(classifyShareResult(result({transferStatus: 'WAITING_FOR_AUTH'}))).toBe('wait');
    expect(classifyShareResult(result({transferStatus: 'QUEUED'}))).toBe('show-progress');
  });

  test('접수 응답은 reelId가 있으면 진행 표시, 없으면 실패이고 401은 인증 실패로 가른다', () => {
    expect(
      classifyShareResult(result({transferStatus: 'API_SUCCEEDED', reelId: '42'})),
    ).toBe('show-progress');
    expect(
      classifyShareResult(result({transferStatus: 'API_FAILED', failureReason: 'MEDIA400_001'})),
    ).toBe('extraction-failed');
    expect(
      classifyShareResult(
        result({transferStatus: 'API_FAILED', failureReason: 'AUTH401_001 | 토큰 만료 | HTTP_401'}),
      ),
    ).toBe('auth-failed');
  });
});
