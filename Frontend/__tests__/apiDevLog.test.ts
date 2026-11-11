import {formatApiLog, redactSensitive} from '../src/lib/api/devLog';

test('토큰처럼 민감한 키의 값은 가린다', () => {
  expect(
    redactSensitive({
      accessToken: 'a',
      refreshToken: 'b',
      member: {id: 1, nickname: '담이'},
      places: [{name: 'Ichiran', placeUrl: 'https://maps.example'}],
    }),
  ).toEqual({
    accessToken: '[REDACTED]',
    refreshToken: '[REDACTED]',
    member: {id: 1, nickname: '담이'},
    places: [{name: 'Ichiran', placeUrl: 'https://maps.example'}],
  });
});

test('요청 결과를 메서드, 주소, 상태, 걸린 시간과 응답 본문으로 남긴다', () => {
  const log = formatApiLog({
    method: 'GET',
    url: 'https://dev.example/api/v1/shares',
    durationMs: 120.4,
    status: 200,
    body: {failureReason: 'PLACE_NOT_EXTRACTED'},
  });

  expect(log).toContain('[API] GET https://dev.example/api/v1/shares → 200 (120ms)');
  expect(log).toContain('"failureReason": "PLACE_NOT_EXTRACTED"');
});

test('긴 응답은 앞부분만 남긴다', () => {
  const log = formatApiLog({
    method: 'GET',
    url: '/x',
    durationMs: 1,
    status: 200,
    body: {text: 'a'.repeat(5000)},
  });

  expect(log).toContain('자 생략');
  expect(log.length).toBeLessThan(4200);
});

test('응답을 받지 못한 요청은 오류 종류를 남긴다', () => {
  expect(
    formatApiLog({method: 'POST', url: '/x', durationMs: 10000, error: 'timeout: 응답이 늦어요'}),
  ).toBe('[API] POST /x → ERR (10000ms)\ntimeout: 응답이 늦어요');
});
