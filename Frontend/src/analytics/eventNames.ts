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
  /** 공유한 게시물의 장소 추출이 끝났습니다(앱이 공유 목록에서 확인한 시점). `result`, `place_count` */
  extractionCompleted: 'extraction_completed',
  savedPlacesViewed: 'saved_places_viewed',
  savedPlacesSearchSubmitted: 'saved_places_search_submitted',
  savedPlaceSelected: 'saved_place_selected',
  savedPlaceOpened: 'saved_place_opened',
  placeMapViewed: 'place_map_viewed',
  /** 비활성: 대기함 화면이 제거되어 호출되지 않습니다. */
  pendingPlacesViewed: 'pending_places_viewed',
  pendingPlaceSaveFinished: 'pending_place_save_finished',
  pendingPlaceDiscardFinished: 'pending_place_discard_finished',
  pendingResolutionCompleted: 'pending_resolution_completed',
  /** PMF 설문 모달이 보였습니다. `survey_id` */
  pmfSurveyViewed: 'pmf_survey_viewed',
  /** PMF 설문을 답하지 않고 닫았습니다. `survey_id`, `method` */
  pmfSurveyDismissed: 'pmf_survey_dismissed',
  /** PMF 설문에 답했습니다. `survey_id`, `answer` */
  pmfSurveyAnswered: 'pmf_survey_answered',
} as const;
