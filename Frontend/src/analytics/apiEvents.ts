import { capture, type AnalyticsClient } from './analytics';

/**
 * 서버 요청이 429를 받았을 때 보냅니다. nginx가 직접 끝낸 429는 서버 로그에 남지 않아 한도에
 * 걸리는지를 앱 이벤트로 봅니다. 요청 ID가 없는 응답이라 경로만 싣고, 시각은 따로 싣지 않고
 * 이벤트 timestamp를 씁니다(PostHog가 sent_at으로 기기 시계 차이를 보정합니다).
 */
export function trackApiRateLimited(
  client: AnalyticsClient | null | undefined,
  path: string,
) {
  capture(client, 'api_rate_limited', {
    path,
  });
}
