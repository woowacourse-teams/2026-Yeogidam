# 에러 응답과 로그 계약

작성일 2026-09-23. `GlobalExceptionHandler`가 잡는 예외와 그때 나가는 응답, 남는 로그를 적는다. 표의 값은 E2E로 실제 요청을 보내 받은 것이다.

## 1. 응답 모양

실패 응답은 어떤 예외든 두 필드만 가진다. 클라이언트가 쓰던 `retryable`, `requestId`, `status`는 두지 않는다.

```json
{"message": "저장된 장소가 아닙니다.", "errorCode": "PLACE404_001"}
```

`message`는 `ErrorCode` enum에 적은 한국어다. 스프링이 만든 영어 메시지(`Required request parameter 'platform' ... is not present`)는 클라이언트로 내보내지 않는다. 내부 타입 이름이 드러나고 스프링을 올리면 문구가 바뀌기 때문이다.

`errorCode`는 `<도메인><HTTP상태>_<순번>`이다. 도메인이 없는 공통 예외는 `COMMON`을 쓴다.

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
| `GET /api/v1/saved-places/999/media` (남의 항목) | `YeogidamException` | 404 | 저장된 장소가 아닙니다. | `PLACE404_001` | `INFO [요청 거부] PLACE404_001` |
| `GET /api/v1/saved-places` (토큰 없음) | `YeogidamException` | 401 | 로그인이 필요한 요청입니다. | `AUTH401_004` | `WARN [인증 거부] AUTH401_004` |
| 그 밖의 예외 | `Exception` 폴백 | 500 | 예기치 못한 예외가 발생했습니다. | `COMMON500_001` | `ERROR [예기치 못한 오류] GET /경로` + 스택 |

## 3. 공통 코드와 도메인 코드가 갈리는 기준

공통 코드(`COMMON`)는 **요청이 서버까지 제대로 도착하지 못한 것**이고, 도메인 코드는 **요청은 잘 왔는데 내용이 규칙에 맞지 않는 것**이다. 같은 400이어도 이렇게 갈린다.

| 상황 | 예 | 코드 |
|---|---|---|
| 파라미터가 아예 없다 | `GET /app-update-policies` | `COMMON400_003` |
| 값은 왔는데 타입이 틀리다 | `?savedPlaceIds=abc` | `COMMON400_004` |
| 값은 왔는데 뜻이 틀리다 | `?platform=web` | `APP400_001` |
| 값은 왔는데 비어 있다 | `?savedPlaceIds=` | `PLACE400_001` |

그래서 컨트롤러는 `@RequestParam`을 `required = true`(기본값)로 두고 누락은 웹 계층이 막는다.

## 4. 로그 규칙

`logException`이 HTTP 상태로 수준을 고른다.

| 상태 | 수준 | 머리말 |
|---|---|---|
| 5xx | ERROR | `[요청 실패]` |
| 401, 403 | WARN | `[인증 거부]` |
| 그 밖의 4xx | INFO | `[요청 거부]` |

응답을 `toResponse`로 만드는 핸들러는 그 안에서 로그가 남는다. 직접 조립하는 핸들러는 셋이고 이유가 각각 있다.

| 핸들러 | 직접 조립하는 이유 |
|---|---|
| `HttpRequestMethodNotSupported` | 405는 `Allow` 헤더를 같이 내려야 하는데 `toResponse`가 헤더를 받지 않는다 |
| `IllegalArgument` | 응답에는 공통 문구만 내보내되 거부 사유와 스택은 로그에 남긴다 |
| `Exception` 폴백 | 요청 메서드와 경로, 스택을 남긴다 |

`IllegalArgument`만 일반 4xx인데 WARN이다. 클라이언트 잘못일 수도 있고 우리가 못 걸러낸 버그일 수도 있어 한 단계 올렸다.

## 5. 알아 둘 것 둘

**`/api` 아래의 없는 경로는 404가 아니라 401이다.** `LoginCheckInterceptor`가 `/api/**`를 전부 검사해서 없는 경로도 인증에 먼저 걸린다. `COMMON404_001`은 `/api` 밖 경로에서만 나온다. 로그인하지 않은 사람에게 경로 존재를 알려 주지 않는 동작이라 그대로 둘지, 404로 맞출지는 정하지 않았다.

**405는 아직 로그가 없다.** 채우려면 그 핸들러에 `logException(CommonErrorCode.METHOD_NOT_ALLOWED)` 한 줄을 넣으면 된다.

## 6. 도메인 예외를 더할 때

1. 도메인 패키지의 `XxxErrorCode` enum에 `(HttpStatus, "<도메인><상태>_<순번>", "한국어 메시지")`를 더한다.
2. 던질 때는 그 도메인의 `XxxException`을 쓴다. 최상위 `YeogidamException`을 상속하므로 핸들러를 새로 만들 필요가 없다.
3. 표준 예외로 충분하면 커스텀 예외를 만들지 않는다. `IllegalArgumentException`은 `COMMON400_005`로 잡힌다.

`ErrorCode`가 상태를 데이터로 들고 있어서 도메인 예외 핸들러는 `handleYeogidamException` 하나뿐이다. 상태별로 예외 클래스를 나누지 않는다.
