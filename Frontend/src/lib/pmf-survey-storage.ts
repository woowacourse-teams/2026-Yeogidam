import AsyncStorage from '@react-native-async-storage/async-storage';

const ANSWERED_PMF_SURVEY_KEY_PREFIX = '@yeogidam/answered-pmf-survey/';

// 회원별로 기록합니다. 기기에만 저장하므로 재설치하거나 기기를 바꾸면 다시 물어봅니다.
// 중복 응답은 PostHog에서 회원 ID 기준으로 걸러 냅니다.
function answeredKey(surveyId: string, memberId: string) {
  return `${ANSWERED_PMF_SURVEY_KEY_PREFIX}${surveyId}/${memberId}`;
}

export async function hasAnsweredPmfSurvey(
  surveyId: string,
  memberId: string,
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(answeredKey(surveyId, memberId))) === 'true';
  } catch {
    return false;
  }
}

export async function rememberAnsweredPmfSurvey(
  surveyId: string,
  memberId: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(answeredKey(surveyId, memberId), 'true');
  } catch {
    // 저장할 수 없어도 이번 실행 중에는 다시 묻지 않습니다.
  }
}
