import {createContext, useCallback, useContext, useMemo} from 'react';
import {usePostHog} from 'posthog-react-native';

import {
  capture,
  type AnalyticsClient,
  type AnalyticsProperties,
} from './analytics';

/**
 * 화면·버튼·기능 단위의 사용자 행동 이벤트입니다. 이벤트 종류는 적게 두고, 어느 화면의 어떤
 * 버튼인지는 `screen_name`·`button_name` 같은 속성으로 구분합니다. 그래야 새 버튼이 생겨도
 * 이벤트 이름이 늘지 않고, PostHog에서 속성으로 쪼개 퍼널을 만들 수 있습니다.
 * 이름은 퍼널·대시보드가 의존하므로 `analyticsEventNames.test.ts`로 고정합니다.
 * 속성에는 장소명·검색어·이메일 같은 개인 정보나 자유 입력 텍스트를 넣지 않습니다.
 */
export const UI_EVENTS = {
  /** 화면이 열렸습니다. `screen_name` */
  screenViewed: 'screen_viewed',
  /** 버튼·링크·아이콘을 눌렀습니다. `screen_name`, `button_name` */
  buttonPressed: 'button_pressed',
  /** 탭·필터·토글 같은 선택이 바뀌었습니다. `screen_name`, `selection_name`, `value` */
  selectionChanged: 'selection_changed',
  /** 모달·시트·다이얼로그가 보였습니다. `screen_name`, `modal_name` */
  modalViewed: 'modal_viewed',
  /** 안내·온보딩의 단계가 보였습니다. `flow_name`, `step_index`, `step_count` */
  stepViewed: 'step_viewed',
  /** 당겨서 새로고침했습니다. `screen_name` */
  listRefreshed: 'list_refreshed',
  /** 지도 검색을 제출했습니다. `has_result`, `result_count`, `query_length` */
  mapSearchSubmitted: 'map_search_submitted',
  /** 로그아웃·회원탈퇴·프로필 수정 같은 기능의 결과입니다. `action_name`, `outcome` */
  actionFinished: 'action_finished',
} as const;

/**
 * 여러 화면이 같이 쓰는 컴포넌트(장소 상세 등)가 어느 화면에서 쓰였는지 알려줍니다.
 * Provider가 없으면 `unknown`으로 기록됩니다.
 */
export const AnalyticsScreenContext = createContext('unknown');

export type UiEventName = (typeof UI_EVENTS)[keyof typeof UI_EVENTS];

/** 이벤트를 기록합니다. PostHog가 없으면 조용히 건너뜁니다. */
export function trackUi(
  client: AnalyticsClient | null | undefined,
  eventName: UiEventName,
  properties: AnalyticsProperties = {},
) {
  capture(client, eventName, properties);
}

export function trackScreenViewed(
  client: AnalyticsClient | null | undefined,
  screenName: string,
  properties: AnalyticsProperties = {},
) {
  trackUi(client, UI_EVENTS.screenViewed, {
    screen_name: screenName,
    ...properties,
  });
}

export function trackButtonPressed(
  client: AnalyticsClient | null | undefined,
  screenName: string,
  buttonName: string,
  properties: AnalyticsProperties = {},
) {
  trackUi(client, UI_EVENTS.buttonPressed, {
    screen_name: screenName,
    button_name: buttonName,
    ...properties,
  });
}

export function trackSelectionChanged(
  client: AnalyticsClient | null | undefined,
  screenName: string,
  selectionName: string,
  value: string | number | boolean,
  properties: AnalyticsProperties = {},
) {
  trackUi(client, UI_EVENTS.selectionChanged, {
    screen_name: screenName,
    selection_name: selectionName,
    value,
    ...properties,
  });
}

export function trackActionFinished(
  client: AnalyticsClient | null | undefined,
  actionName: string,
  outcome: 'success' | 'failure',
  properties: AnalyticsProperties = {},
) {
  trackUi(client, UI_EVENTS.actionFinished, {
    action_name: actionName,
    outcome,
    ...properties,
  });
}

/** 컴포넌트에서 쓰는 `{screen}.button('이름')` 형태의 기록 함수 묶음을 돌려줍니다. */
export function useScreenAnalytics(screenNameOverride?: string) {
  const posthog = usePostHog();
  const contextScreenName = useContext(AnalyticsScreenContext);
  const screenName = screenNameOverride ?? contextScreenName;

  const button = useCallback(
    (buttonName: string, properties?: AnalyticsProperties) =>
      trackButtonPressed(posthog, screenName, buttonName, properties),
    [posthog, screenName],
  );
  const selection = useCallback(
    (
      selectionName: string,
      value: string | number | boolean,
      properties?: AnalyticsProperties,
    ) =>
      trackSelectionChanged(
        posthog,
        screenName,
        selectionName,
        value,
        properties,
      ),
    [posthog, screenName],
  );
  const modal = useCallback(
    (modalName: string, properties?: AnalyticsProperties) =>
      trackUi(posthog, UI_EVENTS.modalViewed, {
        screen_name: screenName,
        modal_name: modalName,
        ...properties,
      }),
    [posthog, screenName],
  );
  const refreshed = useCallback(
    () =>
      trackUi(posthog, UI_EVENTS.listRefreshed, {screen_name: screenName}),
    [posthog, screenName],
  );

  // 화면들이 반환값을 useCallback, useEffect 의존성으로 쓰기 때문에
  // 렌더마다 같은 객체를 돌려줍니다.
  return useMemo(
    () => ({button, selection, modal, refreshed}),
    [button, selection, modal, refreshed],
  );
}

/** 온보딩·가이드처럼 여러 단계로 된 흐름의 단계 노출과 버튼을 기록합니다. */
export function useStepAnalytics(flowName: string, stepCount: number) {
  const posthog = usePostHog();

  const stepViewed = useCallback(
    (stepIndex: number) =>
      trackUi(posthog, UI_EVENTS.stepViewed, {
        flow_name: flowName,
        step_index: stepIndex,
        step_count: stepCount,
      }),
    [flowName, posthog, stepCount],
  );
  const button = useCallback(
    (buttonName: string, stepIndex: number) =>
      trackButtonPressed(posthog, flowName, buttonName, {
        step_index: stepIndex,
        step_count: stepCount,
      }),
    [flowName, posthog, stepCount],
  );

  return {stepViewed, button};
}
