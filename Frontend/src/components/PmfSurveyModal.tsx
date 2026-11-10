import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';

import { AppModal } from './AppModal';
import {
  trackPmfSurveyAnswered,
  trackPmfSurveyDismissed,
  trackPmfSurveyViewed,
  type PmfSurveyAnswer,
  type PmfSurveyDismissMethod,
} from '../analytics/pmfSurveyEvents';
import {
  hasAnsweredPmfSurvey,
  rememberAnsweredPmfSurvey,
} from '../lib/pmf-survey-storage';

// 스프린트 3 PMF 설문입니다. KST 기준 endsAt 시각부터는 표시하지 않습니다.
export const PMF_SURVEY = {
  id: 'pmf-2026-sprint3',
  endsAt: new Date('2026-11-14T00:00:00+09:00'),
};

// 문항과 선택지는 팀 간 비교를 위해 Sean Ellis 원문 그대로 씁니다.
const PMF_SURVEY_QUESTION_LINES = ['이 제품을 더 이상 쓸 수 없다면', '어떻겠습니까?'];
export const PMF_SURVEY_QUESTION = PMF_SURVEY_QUESTION_LINES.join(' ');
export const PMF_SURVEY_OPTIONS: { value: PmfSurveyAnswer; label: string }[] = [
  { value: 'very_disappointed', label: '매우 실망' },
  { value: 'somewhat_disappointed', label: '약간 실망' },
  { value: 'not_disappointed', label: '실망하지 않음' },
  { value: 'no_longer_use', label: '더 이상 쓰지 않음' },
];

type PmfSurveyModalProps = {
  // 업데이트 안내·이벤트 안내처럼 먼저 보여야 하는 모달이 있으면 false로 미룬다.
  enabled: boolean;
  // 로그인한 회원에게만 묻는다. 비회원이면 null.
  memberId: string | null;
  now?: () => Date;
};

const getCurrentDate = () => new Date();

function isWithinSurveyPeriod(date: Date) {
  return date < PMF_SURVEY.endsAt;
}

export function PmfSurveyModal({
  enabled,
  memberId,
  now = getCurrentDate,
}: PmfSurveyModalProps) {
  const posthog = usePostHog();
  const [answerRecord, setAnswerRecord] = useState<{
    memberId: string;
    answered: boolean;
  } | null>(null);
  const [isInPeriod, setIsInPeriod] = useState(() => isWithinSurveyPeriod(now()));
  // [나중에]는 이번 실행에서만 숨긴다. 다음에 앱을 켜면 답할 때까지 다시 묻는다.
  const [isHiddenForSession, setIsHiddenForSession] = useState(false);
  const [selected, setSelected] = useState<PmfSurveyAnswer | null>(null);
  const hasTrackedViewRef = useRef(false);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    hasAnsweredPmfSurvey(PMF_SURVEY.id, memberId).then(answered => {
      if (!cancelled) setAnswerRecord({ memberId, answered });
    });
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  // 앱을 켜 둔 채 종료 시각을 넘길 수 있어 포그라운드로 돌아올 때 다시 확인한다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setIsInPeriod(isWithinSurveyPeriod(now()));
    });
    return () => subscription.remove();
  }, [now]);

  const hasAnswered =
    memberId !== null && answerRecord?.memberId === memberId
      ? answerRecord.answered
      : null;

  const visible =
    enabled &&
    memberId !== null &&
    isInPeriod &&
    hasAnswered === false &&
    !isHiddenForSession;

  useEffect(() => {
    if (!visible || hasTrackedViewRef.current) return;
    hasTrackedViewRef.current = true;
    trackPmfSurveyViewed(posthog, PMF_SURVEY.id);
  }, [posthog, visible]);

  const hideForSession = useCallback(
    (method: PmfSurveyDismissMethod) => {
      setIsHiddenForSession(true);
      trackPmfSurveyDismissed(posthog, PMF_SURVEY.id, method);
    },
    [posthog],
  );

  const submit = useCallback(() => {
    if (!selected || !memberId) return;
    setAnswerRecord({ memberId, answered: true });
    trackPmfSurveyAnswered(posthog, PMF_SURVEY.id, selected);
    rememberAnsweredPmfSurvey(PMF_SURVEY.id, memberId).catch(() => undefined);
  }, [memberId, posthog, selected]);

  return (
    <AppModal
      animationType="fade"
      onRequestClose={() => hideForSession('system_back')}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          {/* 문구는 원문 그대로 두고, 단어 중간에서 끊기지 않도록 의미 단위로 줄을 나눈다. */}
          <Text
            accessibilityLabel={PMF_SURVEY_QUESTION}
            accessibilityRole="header"
            lineBreakStrategyIOS="hangul-word"
            style={styles.title}
          >
            {PMF_SURVEY_QUESTION_LINES.join('\n')}
          </Text>
          <Text lineBreakStrategyIOS="hangul-word" style={styles.message}>
            한 번만 답해 주시면 다시 묻지 않아요.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {PMF_SURVEY_OPTIONS.map(option => {
              const isSelected = selected === option.value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  key={option.value}
                  onPress={() => setSelected(option.value)}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  testID={`pmf-survey-option-${option.value}`}
                >
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text
                    style={[styles.optionText, isSelected && styles.optionTextSelected]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: selected === null }}
            disabled={selected === null}
            onPress={submit}
            testID="pmf-survey-submit-button"
            style={({ pressed }) => [
              styles.primaryButton,
              selected === null && styles.primaryButtonDisabled,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>답변 보내기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => hideForSession('later_button')}
            style={styles.laterButton}
            testID="pmf-survey-later-button"
          >
            <Text style={styles.laterButtonText}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

// 앱 공통 색: 선택 표시 #7186ed, 강조 텍스트 #5c6fc8, 주요 버튼은 로그인 안내와 같은 네이비.
const SELECTION = '#7186ed';
const ACCENT_TEXT = '#5c6fc8';
const SELECTED_BACKGROUND = '#EEF1FC';
const PRIMARY_BUTTON = '#1f2238';

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    backgroundColor: '#F7F7F8',
    borderRadius: 30,
    maxWidth: 340,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    width: '100%',
  },
  title: {
    color: '#171719',
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 27,
    marginTop: 8,
    textAlign: 'center',
  },
  message: {
    color: '#5A5A5F',
    fontSize: 14,
    letterSpacing: -0.3,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  options: {
    gap: 8,
    marginTop: 20,
  },
  option: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E4E8',
    borderRadius: 16,
    borderWidth: 1.5,
    flexDirection: 'row',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  optionSelected: {
    backgroundColor: SELECTED_BACKGROUND,
    borderColor: SELECTION,
  },
  radio: {
    alignItems: 'center',
    borderColor: '#C2C2C8',
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    marginRight: 12,
    width: 20,
  },
  radioSelected: {
    borderColor: SELECTION,
  },
  radioDot: {
    backgroundColor: SELECTION,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  optionText: {
    color: '#171719',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.35,
  },
  optionTextSelected: {
    color: ACCENT_TEXT,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: PRIMARY_BUTTON,
    borderRadius: 26,
    height: 49,
    justifyContent: 'center',
    marginTop: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.3,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  laterButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginTop: 8,
  },
  laterButtonText: {
    color: '#5A5A5F',
    fontSize: 15,
    fontWeight: '500',
  },
});
