/**
 * 개발 빌드에서만 API 요청 결과를 Metro 콘솔에 남깁니다.
 * 토큰처럼 민감한 키의 값은 가리고, 긴 응답은 앞부분만 남깁니다. 요청 헤더는 남기지 않습니다.
 */
const SENSITIVE_KEY = /token|password|secret|authorization|credential/i;
const MAX_LOG_LENGTH = 4000;

export type ApiLogEntry = {
  method: string;
  url: string;
  durationMs: number;
  status?: number;
  body?: unknown;
  error?: string;
};

function isEnabled(): boolean {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  // 테스트 출력이 API 로그로 덮이지 않게 Jest에서는 끕니다.
  const env = (globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env;
  return env?.JEST_WORKER_ID === undefined;
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(item),
      ]),
    );
  }
  return value;
}

export function formatApiLog({method, url, durationMs, status, body, error}: ApiLogEntry): string {
  const head = `[API] ${method} ${url} → ${status ?? 'ERR'} (${Math.round(durationMs)}ms)`;
  let detail = error ?? '';
  if (body !== undefined) {
    try {
      detail = JSON.stringify(redactSensitive(body), null, 2);
    } catch {
      detail = String(body);
    }
  }
  if (detail.length > MAX_LOG_LENGTH) {
    detail = `${detail.slice(0, MAX_LOG_LENGTH)}\n… (${detail.length - MAX_LOG_LENGTH}자 생략)`;
  }
  return detail ? `${head}\n${detail}` : head;
}

export function logApiResult(entry: ApiLogEntry): void {
  if (!isEnabled()) return;
  const message = formatApiLog(entry);
  if (entry.error || (entry.status !== undefined && entry.status >= 400)) {
    console.warn(message);
  } else {
    console.log(message);
  }
}
