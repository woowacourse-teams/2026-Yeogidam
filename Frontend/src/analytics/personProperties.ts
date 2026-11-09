import type {AnalyticsValue} from './analytics';
import type {LoginProvider} from './userEntryEvents';

type PersonPropertyValues = Record<string, AnalyticsValue>;

/** PostHog 사람 프로필에 속성을 붙이는 데 필요한 최소 인터페이스입니다. */
export type PersonPropertiesClient = {
  setPersonProperties?: (
    userPropertiesToSet?: PersonPropertyValues,
    userPropertiesToSetOnce?: PersonPropertyValues,
    reloadFeatureFlags?: boolean,
  ) => void;
};

/*
 * 사람(회원) 단위로 코호트를 나누기 위한 속성입니다. 이벤트 속성과 달리 프로필에 남아,
 * "카카오로 가입한 회원의 리텐션"이나 "장소를 10개 이상 저장한 회원" 같은 분석에 씁니다.
 * 이름·이메일 같은 개인 정보는 넣지 않습니다. 회원으로 식별된 뒤에만 호출합니다.
 */

/** 로그인에 성공했을 때 로그인 방식과 시각, 신규 가입이면 가입 정보를 남깁니다. */
export function setLoginPersonProperties(
  client: PersonPropertiesClient | null | undefined,
  params: {provider: LoginProvider; isNewMember?: boolean; now?: Date},
) {
  const at = (params.now ?? new Date()).toISOString();
  client?.setPersonProperties?.(
    {last_login_provider: params.provider, last_login_at: at},
    {
      first_login_provider: params.provider,
      first_login_at: at,
      // 서버가 신규 여부를 내리는 경우에만 가입 시점을 알 수 있습니다.
      ...(params.isNewMember === true
        ? {signup_provider: params.provider, signup_at: at}
        : {}),
    },
    false,
  );
}

/** 보관함을 불러왔을 때 저장한 장소 수를 갱신합니다. 처음 장소가 생긴 것을 본 시각도 한 번만 남깁니다. */
export function setLibraryPersonProperties(
  client: PersonPropertiesClient | null | undefined,
  params: {savedPlaceCount: number; now?: Date},
) {
  const hasSavedPlace = params.savedPlaceCount > 0;
  client?.setPersonProperties?.(
    {saved_place_count: params.savedPlaceCount, has_saved_place: hasSavedPlace},
    hasSavedPlace
      ? {first_saved_place_seen_at: (params.now ?? new Date()).toISOString()}
      : undefined,
    false,
  );
}
