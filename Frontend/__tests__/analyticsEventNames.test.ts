import {ANALYTICS_EVENTS} from '../src/analytics/eventNames';
import {SHARE_EXTRACTION_EVENTS} from '../src/analytics/placeExtractionEvents';

// Node 타입을 쓰지 않으므로 require로 읽습니다. Jest는 프로젝트 루트에서 실행됩니다.
const fs = require('fs') as {readFileSync: (path: string, encoding: string) => string};
const read = (relativePath: string) => fs.readFileSync(relativePath, 'utf8');

describe('analytics event names', () => {
  // 이름을 바꾸면 기존 Funnel과 대시보드가 끊깁니다. 의도한 변경이면 문서와 함께 갱신하세요.
  test('are fixed', () => {
    expect(ANALYTICS_EVENTS).toMatchInlineSnapshot(`
      {
        "appOpened": "app_opened",
        "extractionRequestFinished": "extraction_request_finished",
        "extractionRequestStarted": "extraction_request_started",
        "guestTransferFinished": "guest_transfer_finished",
        "historyContentDetailViewed": "history_content_detail_viewed",
        "historyContentViewed": "history_content_viewed",
        "historyViewed": "history_viewed",
        "loginFinished": "login_finished",
        "loginStarted": "login_started",
        "placeMapViewed": "place_map_viewed",
        "savedPlaceOpened": "saved_place_opened",
        "savedPlaceSelected": "saved_place_selected",
        "savedPlacesSearchSubmitted": "saved_places_search_submitted",
        "savedPlacesViewed": "saved_places_viewed",
      }
    `);
  });

  test('are the only event names used in src/analytics', () => {
    const files = [
      'userEntryEvents',
      'placeExtractionEvents',
      'savedPlaceEvents',
    ];

    for (const file of files) {
      expect(read(`src/analytics/${file}.ts`)).not.toMatch(
        /capture\(\s*client,\s*['"`]/,
      );
    }
  });

  test('have unique values', () => {
    const values = Object.values(ANALYTICS_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('native share event names', () => {
  test('are the same set the Android and iOS outboxes accept', () => {
    const android = read(
      'android/app/src/main/java/com/yeogidamm/app/share/ShareAnalyticsStore.kt',
    );
    const ios = read('ios/Shared/ShareIntentStorage.swift');

    for (const name of SHARE_EXTRACTION_EVENTS) {
      expect(android).toContain(`"${name}" to`);
      expect(ios).toContain(`"${name}": [`);
    }
  });

  test('do not overlap with events the app records itself, except the shared request pair', () => {
    const appEvents = new Set<string>(Object.values(ANALYTICS_EVENTS));
    const overlap = SHARE_EXTRACTION_EVENTS.filter(name => appEvents.has(name));

    expect(overlap.sort()).toEqual([
      'extraction_request_finished',
      'extraction_request_started',
    ]);
  });
});
