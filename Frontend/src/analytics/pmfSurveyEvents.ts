import {ANALYTICS_EVENTS} from './eventNames';
import {capture, type AnalyticsClient} from './analytics';

/** Sean Ellis PMF 문항의 선택지입니다. 팀 간 비교를 위해 선택지는 바꾸지 않습니다. */
export type PmfSurveyAnswer =
  | 'very_disappointed'
  | 'somewhat_disappointed'
  | 'not_disappointed'
  | 'no_longer_use';

/** `system_back`은 안드로이드 뒤로가기로 닫은 경우입니다. */
export type PmfSurveyDismissMethod = 'later_button' | 'system_back';

export function trackPmfSurveyViewed(
  client: AnalyticsClient | null | undefined,
  surveyId: string,
) {
  capture(client, ANALYTICS_EVENTS.pmfSurveyViewed, {survey_id: surveyId});
}

export function trackPmfSurveyDismissed(
  client: AnalyticsClient | null | undefined,
  surveyId: string,
  method: PmfSurveyDismissMethod,
) {
  capture(client, ANALYTICS_EVENTS.pmfSurveyDismissed, {
    survey_id: surveyId,
    method,
  });
}

export function trackPmfSurveyAnswered(
  client: AnalyticsClient | null | undefined,
  surveyId: string,
  answer: PmfSurveyAnswer,
) {
  capture(client, ANALYTICS_EVENTS.pmfSurveyAnswered, {
    survey_id: surveyId,
    answer,
  });
}
