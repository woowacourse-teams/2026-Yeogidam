const SERVER_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

/**
 * 서버 시각(ISO-8601 UTC)을 Date로 바꿉니다. 서버는 소수 자리를 0, 3, 6자리처럼 필요한 만큼만
 * 쓰는데, 엔진이 반드시 읽어야 하는 표준 형식은 소수 자리가 없거나 3자리인 경우뿐이라 밀리초
 * 3자리로 자르거나 채운 뒤 Date에 넣습니다.
 * 형식이 다르면 Invalid Date를 돌려줍니다.
 *
 * 히스토리 커서의 cursorCreatedAt처럼 서버에 다시 보내야 하는 시각은 바꾸지 않고 받은 문자열을
 * 보존합니다. 밀리초로 자르면 마이크로초가 사라져 다음 페이지 경계가 어긋납니다.
 */
export function parseServerDateTime(value: string): Date {
  const match = SERVER_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return new Date(Number.NaN);
  }

  const milliseconds = (match[2] ?? '').slice(0, 3).padEnd(3, '0');

  return new Date(`${match[1]}.${milliseconds}Z`);
}

/**
 * 서버 식별자(Long, JSON 숫자)를 앱이 쓰는 문자열 식별자로 바꿉니다. 서버 식별자는 JS 안전 정수
 * 범위 안이라 값이 달라지지 않고, 서버로 보낼 때도 바꾼 문자열을 그대로 씁니다.
 */
export function toIdString(id: number): string {
  return String(id);
}
