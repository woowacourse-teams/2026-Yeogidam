import type {NativeShareResult} from '../src/lib/share-intent';
import {
  classifyShareResult,
  selectShareResult,
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

describe('selectShareResult', () => {
  test('가장 최근 결과가 비회원 로그인 유도면 그 결과를 고른다', () => {
    const results = [
      result({requestId: 'tracked', transferStatus: 'REQUESTING'}),
      result({requestId: 'guest', transferStatus: 'GUEST_LOGIN_PROMPT'}),
    ];

    expect(selectShareResult(results, 'tracked')?.requestId).toBe('guest');
  });

  test('화면이 추적 중인 요청이 있으면 그 결과를, 없으면 가장 최근 결과를 고른다', () => {
    const results = [
      result({requestId: 'tracked', transferStatus: 'REQUESTING'}),
      result({requestId: 'newer', transferStatus: 'QUEUED'}),
    ];

    expect(selectShareResult(results, 'tracked')?.requestId).toBe('tracked');
    expect(selectShareResult(results, 'missing')?.requestId).toBe('newer');
    expect(selectShareResult(results, undefined)?.requestId).toBe('newer');
    expect(selectShareResult([], undefined)).toBeUndefined();
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
