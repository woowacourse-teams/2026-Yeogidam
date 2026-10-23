/**
 * 앱이 직접 기록하는 PostHog 이벤트 이름입니다. 이름이 바뀌면 기존 Funnel과 대시보드가
 * 끊기므로 한 곳에서 관리하고 테스트(`analyticsEventNames.test.ts`)로 고정합니다.
 * 공유 확장이 기록해 앱이 전달하는 이벤트는 `SHARE_EXTRACTION_EVENTS`를 참고하세요.
 */
export const ANALYTICS_EVENTS = {
  appOpened: 'app_opened',
  loginStarted: 'login_started',
  loginFinished: 'login_finished',
  historyViewed: 'history_viewed',
  historyContentViewed: 'history_content_viewed',
  historyContentDetailViewed: 'history_content_detail_viewed',
  extractionRequestStarted: 'extraction_request_started',
  extractionRequestFinished: 'extraction_request_finished',
  savedPlacesViewed: 'saved_places_viewed',
  savedPlacesSearchSubmitted: 'saved_places_search_submitted',
  savedPlaceSelected: 'saved_place_selected',
  savedPlaceOpened: 'saved_place_opened',
  placeMapViewed: 'place_map_viewed',
} as const;
