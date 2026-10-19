# 에러 응답과 로그 계약

작성일 2026-09-23. `GlobalExceptionHandler`가 잡는 예외와 예외를 잡았을 때 나가는 응답, 남는 로그를 적는다. 표의 값은 E2E로 실제 요청을 보내 받았다.

## 1. 응답 모양

실패 응답에는 어떤 예외든 두 필드만 들어가고, 클라이언트가 쓰던 `retryable`, `requestId`, `status`는 넣지 않는다.

```json
{"message": "저장된 장소가 아닙니다.", "errorCode": "PLACE404_001"}
```

`message`에는 `ErrorCode` enum에 적은 한국어 메시지가 들어간다. Spring이 만든 영어 메시지(`Required request parameter 'platform' ... is not present`)는 내부 타입 이름이 드러나고 Spring 버전을 올리면 문구가 바뀌기 때문에 클라이언트로 내보내지 않는다.

`errorCode`는 `<도메인><HTTP상태>_<순번>` 형식으로 짓고 도메인이 없는 공통 예외는 `COMMON`을 쓴다.

## 2. 요청별 응답과 로그

| 요청 | 잡는 핸들러 | 상태 | 응답 `message` | `errorCode` | 로그 |
|---|---|---|---|---|---|
| `POST /api/v1/auth/logins/kakao` 본문 `{}` | `MethodArgumentNotValid` | 400 | 유효하지 않은 요청 필드입니다. | `COMMON400_001` | `INFO [요청 거부] COMMON400_001` |
| `POST /api/v1/auth/logins/kakao` 본문 `{oops` | `HttpMessageNotReadable` | 400 | 올바른 입력값 형식이 아닙니다. | `COMMON400_002` | `INFO [요청 거부] COMMON400_002` |
| `GET /api/v1/app-update-policies` (파라미터 없음) | `MissingServletRequestParameter` | 400 | 필수 요청 파라미터가 누락되었습니다. | `COMMON400_003` | `INFO [요청 거부] COMMON400_003` |
| `GET /api/v1/saved-places/abc/media` | `MethodArgumentTypeMismatch` | 400 | 요청 값의 형식이 올바르지 않습니다. | `COMMON400_004` | `INFO [요청 거부] COMMON400_004` |
| `DELETE /api/v1/saved-places?savedPlaceIds=abc` | `MethodArgumentTypeMismatch` | 400 | 요청 값의 형식이 올바르지 않습니다. | `COMMON400_004` | `INFO [요청 거부] COMMON400_004` |
| 도메인 객체가 값을 거부(2단계부터) | `IllegalArgument` | 400 | 요청 값이 올바르지 않습니다. | `COMMON400_005` | `WARN [요청 거부] COMMON400_005 장소 이름이 비어 있습니다.` + 스택 |
| `POST /api/v1/saved-places` | `HttpRequestMethodNotSupported` | 405 | 지원하지 않는 요청 메서드입니다. | `COMMON405_001` | 없음. `Allow` 헤더를 함께 내린다 |
| `GET /nope` | `NoResourceFound` | 404 | 요청한 경로를 찾을 수 없습니다. | `COMMON404_001` | `INFO [요청 거부] COMMON404_001` |
| `GET /api/v1/app-update-policies?platform=web&appVersion=1.1.0` | `YeogidamException` | 400 | platform은 ios 또는 android여야 합니다. | `APP400_001` | `INFO [요청 거부] APP400_001` |
| `DELETE /api/v1/saved-places?savedPlaceIds=` | `YeogidamException` | 400 | 삭제할 보관함 항목이 없습니다. | `PLACE400_001` | `INFO [요청 거부] PLACE400_001` |
| `GET /oauth/kakao/callback?code=abc&state=forged` (위조, 만료. state가 아예 없으면 `COMMON400_003`) | `YeogidamException` | 400 | 소셜 로그인 요청이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요. | `AUTH400_001` | `INFO [요청 거부] AUTH400_001` |
| `GET /api/v1/saved-places/999/media` (남의 항목) | `YeogidamException` | 404 | 저장된 장소가 아닙니다. | `PLACE404_001` | `INFO [요청 거부] PLACE404_001` |
| `GET /api/v1/saved-places` (토큰 없음) | `YeogidamException` | 401 | 로그인이 필요한 요청입니다. | `AUTH401_004` | `WARN [인증 거부] AUTH401_004` |
| `POST /api/v1/auth/token-refreshes` (교체된 직전 리프레시 토큰을 교체 뒤 10초 안에 다시 보냄) | `YeogidamException` | 401 | 이미 교체된 리프레시 토큰입니다. 새 토큰으로 다시 시도해 주세요. | `AUTH401_005` | `WARN [인증 거부] AUTH401_005` |
| 그 밖의 예외 | `Exception` 폴백 | 500 | 예기치 못한 예외가 발생했습니다. | `COMMON500_001` | `ERROR [예기치 못한 오류] GET /경로` + 스택 |

이미 쓴 리프레시 토큰이 다시 오면 세션을 폐기하고 `AUTH401_003`을 내지만, 교체된 직전 토큰이 교체 뒤 10초 안에 오면 앱과 공유 확장의 동시 재발급으로 보고 세션은 그대로 둔 채 `AUTH401_005`만 낸다. 유예 기록은 서버 메모리에만 있어 재기동하면 비어 있다.

## 3. 공통 코드와 도메인 코드가 갈리는 기준

공통 코드(`COMMON`)는 **요청이 서버까지 제대로 도착하지 못했을 때** 쓰고, 도메인 코드는 **요청은 잘 왔는데 내용이 규칙에 맞지 않을 때** 쓴다. 같은 400이어도 아래 표처럼 코드가 갈린다.

| 상황 | 예 | 코드 |
|---|---|---|
| 파라미터가 아예 없다 | `GET /app-update-policies` | `COMMON400_003` |
| 값은 왔는데 타입이 틀리다 | `?savedPlaceIds=abc` | `COMMON400_004` |
| 값은 왔는데 뜻이 틀리다 | `?platform=web` | `APP400_001` |
| 값은 왔는데 비어 있다 | `?savedPlaceIds=` | `PLACE400_001` |

그래서 컨트롤러는 `@RequestParam`을 `required = true`(기본값)로 두고 누락은 웹 계층이 막는다.

## 4. 로그 규칙

`logException`이 HTTP 상태를 보고 로그 수준을 고른다.

| 상태 | 수준 | 머리말 |
|---|---|---|
| 5xx | ERROR | `[요청 실패]` |
| 401, 403 | WARN | `[인증 거부]` |
| 그 밖의 4xx | INFO | `[요청 거부]` |

`toResponse`는 응답을 만들면서 로그도 남기는데, 아래 세 핸들러는 응답을 직접 조립한다.

| 핸들러 | 직접 조립하는 이유 |
|---|---|
| `HttpRequestMethodNotSupported` | 405는 `Allow` 헤더를 같이 내려야 하는데 `toResponse`가 헤더를 받지 않는다 |
| `IllegalArgument` | 응답에는 공통 문구만 내보내되 거부 사유와 스택은 로그에 남긴다 |
| `Exception` 폴백 | 요청 메서드와 경로, 스택을 남긴다 |

일반 4xx 가운데 `IllegalArgument`만 WARN인데 클라이언트 잘못일 수도 있고 우리가 못 걸러낸 버그일 수도 있어 한 단계 올렸다.

## 5. 알아 둘 것 둘

**`/api` 아래의 없는 경로로 요청하면 404가 아니라 401이 나간다.** `LoginCheckInterceptor`가 `/api/**`를 전부 검사해서 없는 경로도 인증에 먼저 걸리므로 `COMMON404_001`은 `/api` 밖 경로에서만 나온다. 로그인하지 않은 사람에게 경로가 있는지 알려 주지 않는 동작이라 그대로 둘지, 404로 맞출지는 정하지 않았다.

**405는 아직 로그가 없다.** 로그를 남기려면 405 핸들러에 `logException(CommonErrorCode.METHOD_NOT_ALLOWED)` 한 줄을 넣으면 된다.

## 6. 도메인 예외를 더할 때

1. 도메인 패키지의 `XxxErrorCode` enum에 `(HttpStatus, "<도메인><상태>_<순번>", "한국어 메시지")`를 더한다.
2. 던질 때는 같은 도메인의 `XxxException`을 쓰는데, 최상위 `YeogidamException`을 상속하므로 핸들러를 새로 만들 필요가 없다.
3. `IllegalArgumentException`은 `COMMON400_005`로 잡히므로 표준 예외로 충분하면 커스텀 예외를 만들지 않는다.

`ErrorCode`에 상태가 데이터로 들어 있어서 상태별로 예외 클래스를 나누지 않고 도메인 예외는 `handleYeogidamException` 핸들러 하나로 처리한다.
