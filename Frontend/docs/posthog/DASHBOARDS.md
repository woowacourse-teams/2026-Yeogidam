# PostHog 대시보드

공유 흐름을 보는 대시보드 2개, 인사이트 5개의 구성이다. 이벤트와 속성의 정의는 [SHARE_AND_HISTORY_EVENTS.md](./SHARE_AND_HISTORY_EVENTS.md)를 따른다.

| 대시보드 | 답하는 질문 | 링크 |
| --- | --- | --- |
| ① 공유 → 추출 | 공유한 릴스가 추출 요청까지 가는 동안 어디서 빠지는가 | _(만든 뒤 추가)_ |
| ② 공유 카드 이후 행동 | 결과 카드를 본 사용자가 무엇을 하는가 | _(만든 뒤 추가)_ |

오류 감시(앱 열기 실패, 기기 보관 실패 등)는 Sentry가 맡는다. 이 대시보드는 사용자 행동만 본다.

## 공통 필터

모든 인사이트에 건다.

- `environment = production`
- 내부 테스터 제외: 테스터의 `installation_id` 또는 로그인 계정의 `distinct_id`로 코호트를 만들어 제외한다. SQL 인사이트에서는 아래 SQL의 `NOT IN` 목록에 직접 넣는다.
- 🆕 표시가 있는 인사이트는 2.2.1 다음 스토어 빌드부터 데이터가 생긴다. `release`를 그 버전 이상으로 거른다.

**왜 `share_id` 기준으로 세는가:** 로그인 세션이 없을 때 네이티브 공유 이벤트는 `share_id`를 `distinct_id`로 쓴다. 또 공유 이벤트와 앱 이벤트의 `distinct_id`가 다를 수 있다. 그래서 사람(person) 기준 Funnel로는 공유 한 건의 단계가 이어지지 않는다. 공유 단계는 `share_id`로 묶어 센다.

## ① 공유 → 추출

### 1. 공유 퍼널

공유 한 건이 접수 안내를 거쳐 추출 요청에 성공하기까지의 단계별 건수.

| 단계 | 이벤트 | 조건 |
| --- | --- | --- |
| 1 | `reel_share_received` | |
| 2 | `reel_share_outcome_viewed` | `outcome = accepted` |
| 3 | `extraction_request_started` | |
| 4 | `extraction_request_finished` | `outcome = response_received` |

- **Funnel로 만들 때:** 위 4단계를 넣고 "Aggregating by"를 HogQL 표현식 `properties.share_id`로 바꾼다. 플랫폼은 `platform`으로 분해한다.
- **UI에서 이 집계를 지원하지 않으면** SQL 인사이트로 만든다.

```sql
WITH s AS (
  SELECT
    properties.share_id AS share_id,
    any(properties.platform) AS platform,
    countIf(event = 'reel_share_received') > 0 AS received,
    countIf(event = 'reel_share_outcome_viewed'
            AND properties.outcome = 'accepted') > 0 AS accepted,
    countIf(event = 'extraction_request_started') > 0 AS request_started,
    countIf(event = 'extraction_request_finished'
            AND properties.outcome = 'response_received') > 0 AS response_received
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
    AND properties.environment = 'production'
    AND properties.share_id IS NOT NULL
    -- AND properties.installation_id NOT IN ('테스터 설치 ID', ...)
    AND event IN ('reel_share_received', 'reel_share_outcome_viewed',
                  'extraction_request_started', 'extraction_request_finished')
  GROUP BY share_id
)
SELECT
  platform,
  countIf(received) AS `공유`,
  countIf(received AND accepted) AS `접수 안내`,
  countIf(received AND accepted AND request_started) AS `요청 시작`,
  countIf(received AND accepted AND request_started AND response_received) AS `요청 성공`
FROM s
GROUP BY platform
```

**해석**
- 1→2에서 빠진 건은 로그인 필요나 실패 안내를 본 공유다. 이유는 인사이트 2에서 본다.
- 2→3에서 빠진 건은 아직 전송 대기 중이거나(로그인·네트워크) 전송을 시도하지 못한 공유다. 대기는 최종 실패가 아니므로 최근 며칠 건은 낮게 나온다.
- 3→4에서 빠진 건은 요청 실패다. 유형은 인사이트 3에서 본다.
- 히스토리에서 다시 시도한 추출 요청은 `share_id`가 없어서 자동으로 빠진다.
- 2.2.1 이하는 `outcome_viewed`가 일부 누락돼 2단계가 낮게 나온다. 그 기간은 2단계를 `reel_share_feedback_viewed`(`feedback_type = received`)로 바꿔 본다.

### 2. 결과 카드 분포

사용자가 공유 후 어떤 안내 카드를 봤는가.

- 종류: Trends, 막대(또는 100% 누적)
- 이벤트: `reel_share_outcome_viewed`
- 분해: `outcome`, `reason`
- 플랫폼별로 나누어 본다.

| `outcome` | `reason` | 의미 |
| --- | --- | --- |
| `accepted` | — | 접수됨 |
| `login_required` | `no_session` | 로그인한 적 없는 사용자 (신규) |
| `login_required` | `refresh_token_missing`, `refresh_token_invalid` | 세션 만료 (재로그인) |
| `failed` | `invalid_link` | 릴스·게시물이 아닌 링크 |
| `failed` | `save_failed`, `read_failed` | 기기 보관·읽기 실패 |

### 3. 요청 실패 유형

추출 요청이 왜 실패하는가.

- 종류: Trends, 막대
- 이벤트: `extraction_request_finished`, 조건 `outcome = request_failed`
- 분해: `failure_type`, 플랫폼별
- 값: `auth_failed`, `timeout`, `server_error`, `invalid_request`, `network_error`, `invalid_response`, `interrupted`(Android)

`server_error`나 `invalid_response`가 늘면 백엔드 쪽 확인이 필요하다. `network_error`와 `timeout`은 사용자 환경 영향이 크다.

## ② 공유 카드 이후 행동 🆕

### 4. 성공 카드는 어떻게 끝났나

"공유 완료!" 카드를 본 사용자가 앱으로 갔는지, 껐는지, 그냥 뒀는지.

- 종류: Trends, 100% 누적 막대
- 이벤트: `reel_share_card_dismissed`, 조건 `card_state = success`
- 분해: `method`

| `method` | 의미 |
| --- | --- |
| `app_opened` | [앱에서 보기]를 눌러 앱으로 이동 |
| `tap_outside` | 바깥을 눌러 닫음 (iOS는 카드 본문 탭 포함) |
| `auto` | 아무것도 하지 않아 4초 뒤 자동으로 닫힘 |

Android 뒤로 가기, 스와이프로 시트를 내림, OS가 확장을 종료한 경우는 기록되지 않는다. 그래서 합계가 성공 카드 노출 수보다 조금 적을 수 있다.

### 5. 공유 → 로그인 전환

로그인 안내 카드를 본 공유 중 몇 건이 앱으로 넘어가 실제로 로그인했는가. 공유 이벤트와 앱 로그인 이벤트를 `share_id`로 이어야 하므로 SQL 인사이트로 만든다.

```sql
WITH s AS (
  SELECT
    properties.share_id AS share_id,
    anyIf(properties.reason, event = 'reel_share_outcome_viewed') AS reason,
    countIf(event = 'reel_share_outcome_viewed'
            AND properties.outcome = 'login_required') > 0 AS saw_login_card,
    countIf(event = 'reel_share_card_dismissed'
            AND properties.card_state = 'login_required'
            AND properties.method = 'app_opened') > 0 AS moved_to_app,
    countIf(event = 'login_started'
            AND properties.entry = 'share_login_handoff') > 0 AS login_started,
    countIf(event = 'login_finished'
            AND properties.entry = 'share_login_handoff'
            AND properties.outcome = 'success') > 0 AS login_succeeded
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
    AND properties.environment = 'production'
    AND properties.share_id IS NOT NULL
    -- AND properties.installation_id NOT IN ('테스터 설치 ID', ...)
    AND event IN ('reel_share_outcome_viewed', 'reel_share_card_dismissed',
                  'login_started', 'login_finished')
  GROUP BY share_id
)
SELECT
  if(reason = 'no_session', '신규', '세션 만료') AS `유형`,
  countIf(saw_login_card) AS `로그인 카드`,
  countIf(saw_login_card AND moved_to_app) AS `앱 이동`,
  countIf(saw_login_card AND login_started) AS `로그인 시도`,
  countIf(saw_login_card AND login_succeeded) AS `로그인 성공`
FROM s
WHERE saw_login_card
GROUP BY `유형`
```

**해석**
- 카드 → 앱 이동이 낮으면 로그인 안내 카드의 문구나 버튼을 손볼 대상이다.
- 앱 이동 → 로그인 시도가 낮으면 앱에 들어온 뒤 로그인 화면에서 이탈한 것이다. 로그인 화면 진입은 `screen_viewed`(`screen_name = login`)에 남지만 `entry`는 붙지 않는다.
- 로그인 시도 → 성공이 낮으면 `login_finished`의 `failure_type`을 함께 본다.
- 신규(`no_session`)와 세션 만료를 나눠 보면 가입 유도와 재로그인 중 어디가 약한지 알 수 있다.

## 배포 직후 한 번 확인할 것

대시보드로 두지 않고, 2.2.1 다음 빌드가 나간 뒤 1~2주 안에 한 번 확인한다.

| 확인 | 방법 | 기대 결과 |
| --- | --- | --- |
| 재전송 누락 수정 | `outcome_viewed` 건수 ÷ `feedback_viewed` 건수, `release`별 | 새 버전에서 1에 가까워짐 |
| 닫힘 기록 비율 | `card_dismissed` 건수 ÷ `outcome_viewed` 건수, 플랫폼별 | 1보다 조금 작음. 크게 작으면 기록되지 않는 닫힘이 많다는 뜻 |
| Android 기기 보관 | `share_local_save_resolved`를 `outcome`·`release`로 분해, Android | 새 버전부터 `saved`가 잡힘 |
| 공유 로그인 연결 | `login_started`에서 `entry = share_login_handoff` 건수 | 0이 아님 |

## 관리 규칙

- 대시보드를 만들면 위 표의 링크를 채운다.
- 이벤트 이름이나 속성 값을 바꾸면 이 문서와 대시보드를 같이 고친다.
- 새 질문이 생기면 인사이트를 하나씩 늘린다. 한 질문에 인사이트 하나를 원칙으로 한다.
