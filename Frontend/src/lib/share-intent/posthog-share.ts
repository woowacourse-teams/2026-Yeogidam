import Config from 'react-native-config';
import {buildShareExtractionCapture, isShareExtractionEventName} from '../../analytics/placeExtractionEvents';

import {
  acknowledgeShareAnalyticsEvent,
  getPendingShareAnalyticsEvents,
} from './index';

let flushing = false;

/** Flushes native share events while the containing app is running. */
export async function flushShareAnalytics(): Promise<void> {
  if (flushing) return;
  const key = Config.POSTHOG_PROJECT_TOKEN?.trim();
  const host = Config.POSTHOG_HOST?.trim().replace(/\/$/, '');
  if (!key || !host || !/^https:\/\/[^/?#]+$/.test(host)) return;

  flushing = true;
  try {
    const pending = await getPendingShareAnalyticsEvents();
    for (const event of pending) {
      if (event.id && event.name === 'reel_share_outcome_viewed') {
        await acknowledgeShareAnalyticsEvent(event.id);
        continue;
      }
      if (!event.id || !isShareExtractionEventName(event.name) || !event.share_id || !Number.isFinite(event.occurred_at)) {
        continue;
      }
      try {
        const response = await fetch(`${host}/i/v0/e/`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            api_key: key,
            ...buildShareExtractionCapture({
              uuid: event.uuid,
              name: event.name,
              share_id: event.share_id,
              distinct_id: event.distinct_id,
              occurred_at: event.occurred_at,
              properties: event.properties,
            }),
          }),
        });
        if (!response.ok) break;
        await acknowledgeShareAnalyticsEvent(event.id);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
