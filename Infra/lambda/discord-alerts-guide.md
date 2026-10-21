# 디스코드 알림 동작과 운영 설정

`yeogidam-alerts-to-discord` Lambda 하나가 기존 CloudWatch 알람과 장소 분석 실패 로그를 디스코드로 보낸다.
이 문서는 현재 코드의 환경별 동작, 알림 조건, 메시지 형식, 필요한 설정과 로컬 테스트 방법을 설명한다.

| 파일 | 역할 |
| --- | --- |
| [alerts_to_discord.py](alerts_to_discord.py) | 입력 해석, 메시지 구성, 긴 메시지 분할과 디스코드 전송 |
| [test_alerts_to_discord.py](test_alerts_to_discord.py) | 테스트용 서버로 메시지를 받아 알림 동작 검증 |

## 환경별 동작

| 실행 환경 | 실패 로그 | 디스코드 진단 알림 |
| --- | --- | --- |
| 로컬 `local` | 남음. 기본 일반 텍스트 형식 | 전송 안 함 |
| 개발 `dev` | 남음. Gemini JSON과 카카오 기록을 포함한 JSON 형식 | 전송 안 함 |
| 운영 `prod` | 남음. 개발과 같은 JSON 형식 | 전송 대상 |

환경은 실행 프로필로 구분한다. 운영 알림은 Lambda와 CloudWatch Logs 구독이 연결된 상태에서 전달된다.
백엔드는 로그만 기록하므로 Lambda 설정 여부가 분석이나 DB 저장 동작에 영향을 주지 않는다.
위 표는 장소 분석 실패 진단에 해당한다. 기존 CloudWatch 알람은 개발과 운영에서 기존 SNS 설정에 따라 전달된다.

## 알림 경로와 대상

- 기존 알람: CloudWatch 알람 -> SNS `yeogidam-alerts` -> Lambda -> Discord embed
- 추출 실패: 백엔드 WARN/ERROR 로그 -> CloudWatch Logs 구독 필터 -> 같은 Lambda -> Discord 문장

백엔드는 분석 한 건의 `ExtractionReport`에 Gemini 분석 JSON과 카카오 검색 기록을 모은다.
분석이 최종 실패하면 DB에 실패 상태를 저장한다. 저장이 완료되고 실제 상태 변경이 확인된 경우에
`type=PLACE_EXTRACTION_FAILED`, `version=1`, `report`를 가진 JSON 로그를 남긴다.
Lambda가 이 로그를 받아 디스코드 메시지로 만든다. 웹훅 주소는 Lambda의 `DISCORD_WEBHOOK_URL`에 설정한다.

CloudWatch Logs 경로에서는 다음 조건을 모두 만족한 진단을 전송한다.

- 로그 레벨이 `WARN` 또는 `ERROR`다.
- `type`이 `PLACE_EXTRACTION_FAILED`이고 `version`이 정수 `1`이다.
- `report.environment`가 정확히 `prod`다.
- `report.analysis_status`가 `FAILED`이고 게시물 ID, 지원하는 실패 이유와 실패 단계가 있다.

일반 WARN/ERROR와 INFO 로그는 이 진단 알림의 대상에서 제외한다.
실패 상태 저장이 확인되지 않으면 백엔드는 `분석 실패 상태 저장 미확인` 로그를 남긴다.
저장 중 예외가 나면 `실패 상태 저장 오류` 로그도 남긴다. 두 로그에는 알림용 `type`을 붙이지 않는다.

예상된 분석 실패, 외부 HTTP 응답 오류, 확인 가능한 네트워크 오류와 파싱 오류는 WARN으로 기록한다.
DB, 트랜잭션, 실행기 거절, 로컬 파일 오류와 예상하지 못한 원인은 ERROR로 기록한다.
HTTP 요청 중 발생했더라도 파일 오류나 출처가 불분명한 일반 I/O 오류는 ERROR를 유지한다.
레벨은 원인까지 확인해서 결정하며, 실패 이유 코드만으로 결정하지 않는다.

SNS 경로는 기존 CloudWatch 알람을 embed 형식으로, 일반 SNS 본문을 문장으로 전송한다.
이전 형식의 추출 실패 진단도 계속 처리한다. 기존 알람과 일반 SNS 본문에는 운영 환경 제한을 적용하지 않는다.

## 운영 설정

| 항목 | 설정 |
| --- | --- |
| Lambda 함수 | `yeogidam-alerts-to-discord` |
| 핸들러 | 콘솔의 `lambda_function.py`에 코드를 넣으면 `lambda_function.lambda_handler`. 파일명을 유지해 배포하면 `alerts_to_discord.lambda_handler` |
| 웹훅 환경 변수 | Lambda의 `DISCORD_WEBHOOK_URL` |
| 기존 알람 입력 | SNS `yeogidam-alerts` |
| 실패 진단 입력 | Standard 클래스의 `/yeogidam/prod/backend` 로그 그룹 |
| 로그 구독 이름 | `extraction-failure` |
| 호출 권한 | 위 로그 그룹의 CloudWatch Logs가 Lambda를 호출할 수 있는 권한 |

로그 구독 필터는 다음 조건을 사용한다. 개발 로그 그룹에는 진단 구독을 연결하지 않는다.

```text
{ ($.level = "WARN" || $.level = "ERROR") && $.type = "PLACE_EXTRACTION_FAILED" }
```

구독과 호출 권한은 초기 연결 때 설정한다. Lambda 코드를 수정한 경우에는 함수 코드를 다시 배포한다.
코드는 Python 표준 라이브러리만 사용한다. 웹훅 요청 제한 시간은 요청마다 10초이며 긴 진단은 여러 요청으로 보낸다.
핸들러의 파일명과 함수명 지정은 [AWS Python 핸들러 안내](https://docs.aws.amazon.com/lambda/latest/dg/python-handler.html#python-handler-naming)를 따른다.
구독 조건은 [CloudWatch JSON 필터 문법](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html)을 따른다.

## 로그 계약

운영 Logstash JSON 한 줄에서 `level`, `type`, `version`, `report`를 읽는다. `report`는 중첩 객체다.
이 JSON 안의 `message` 문구는 알림 판단에 사용하지 않는다. 문구가 바뀌거나 필드가 없어도 같은 진단을 처리한다.
CloudWatch 입력의 `logEvents[].message`에는 이 JSON 한 줄이 문자열로 들어간다.

```json
{
  "level": "WARN",
  "type": "PLACE_EXTRACTION_FAILED",
  "version": 1,
  "report": {
    "environment": "prod",
    "media_id": 123,
    "started_at": "2026-10-20T00:00:00Z",
    "instagram_url": "https://www.instagram.com/reel/example/",
    "analysis_status": "FAILED",
    "failure_reason": "PLACE_NOT_MATCHED",
    "failure_stage": "KAKAO_SEARCH",
    "gemini_results": [{
      "stage": "GEMINI_CAPTION",
      "raw_json": "{\"places\":[{\"nameInCaption\":\"카페 A\",\"nameSearchHint\":\"카페 에이\"}]}"
    }],
    "kakao_requests": [{
      "stage": "KAKAO_SEARCH",
      "query": "카페 에이 연남동",
      "parameters": {"size": "15", "page": "1"},
      "http_status": 200,
      "response_count": 0,
      "candidates": []
    }],
    "error": {
      "type": "ExtractionFailedException",
      "message": "지도에서 장소를 찾지 못했어요",
      "cause": null
    }
  }
}
```

`gemini_results`는 본문과 첨부의 분석 결과를 구분한다. 모델이 만든 JSON 문자열을 해석하기 전에
`raw_json`으로 기록하므로 JSON 해석에 실패해도 원문이 남는다.
`kakao_requests`에는 실제 검색어, 요청 조건, HTTP 상태, 응답 건수와 확인한 후보의 제외 이유가 들어간다.
HTTP 상태는 응답 본문을 읽기 전에 기록한다. 본문을 읽지 못하면 수신한 HTTP 상태를 보존하고 결과 건수는 `null`로 둔다.
`error`에는 예외 종류, 메시지와 원인이 들어간다. 백엔드는 최대 6단계의 예외 정보를 기록한다.
회원 ID와 공유 ID는 새로 수집하지 않는다.

Lambda는 base64/gzip 입력을 해제하고 `logEvents`를 순서대로 처리한다. `CONTROL_MESSAGE`는 건너뛴다.
`prod`와 `test`, `dev`, `local`, `fake`가 함께 활성화된 경우는 운영으로 축약하지 않는다.
진단 형식이 잘못되면 예외를 발생시켜 Lambda 실행을 실패로 남긴다.

## 실패 단계

`failure_stage`는 실패 시점에 마지막으로 기록한 작업이다. 모든 단계가 한 분석에서 실행되는 것은 아니다.

| 단계 | 작업 |
| --- | --- |
| `DISPATCH` | 분석 작업 등록 |
| `CONTENT_FETCH` | 인스타그램 게시물 정보 조회 |
| `CONTENT_THUMBNAIL` | 인스타그램 썸네일 저장 |
| `METADATA_STORE` | 본문, 썸네일 저장 키와 작성자를 DB에 저장 |
| `CAPTION_VALIDATE` | 본문이 있는지 확인. 현재 코드는 게시물 정보를 저장한 뒤 확인 |
| `MEDIA_DOWNLOAD` | 분석할 사진과 영상 다운로드 |
| `GEMINI_FILE_UPLOAD` | Gemini에 분석 파일 업로드 |
| `GEMINI_FILE_PROCESSING` | Gemini 업로드 파일의 처리 완료 확인 |
| `GEMINI_CAPTION` | Gemini로 본문 분석 |
| `GEMINI_MEDIA` | Gemini로 본문과 사진, 영상 분석 |
| `KAKAO_ADDRESS` | 카카오 주소 검색으로 좌표 확인 |
| `KAKAO_SEARCH` | 카카오 장소 검색 |
| `PLACE_THUMBNAIL` | 장소 대표 이미지 결정과 저장 |
| `RESULT_SAVE` | 분석 성공 결과를 DB에 저장 |

## Discord 표시와 오류

```text
media_id: 123
장소 추출 실패
분석 시작: 2026-10-20T00:00:00Z
실패 이유: 일치하는 장소를 찾지 못했습니다 (PLACE_NOT_MATCHED)
실패 단계: KAKAO_SEARCH
게시물: https://www.instagram.com/reel/example/
Gemini 분석 JSON (GEMINI_CAPTION):
{"places":[{"nameInCaption":"카페 A","nameSearchHint":"카페 에이"}]}
카카오 검색 1: 카페 에이 연남동
- 단계: KAKAO_SEARCH / HTTP: 200 / 결과: 0건
- 검색 조건: size=15, page=1
오류: ExtractionFailedException / 지도에서 장소를 찾지 못했어요
```

확인한 카카오 후보가 있으면 후보의 이름, 카카오 ID, 주소, 도로명과 제외 이유도 표시한다.
좌표 기반 요청은 `x`, `y`, `radius` 조건을 표시한다. 응답 미확인은 `미확인`, 정상 빈 결과는 `0건`으로 구분한다.
Gemini와 카카오가 실행되지 않았거나 기록을 얻기 전에 실패한 경우도 메시지에 표시한다.

추출 실패 진단은 UTF-16 기준 2,000자 이내의 여러 메시지로 나눈다. 각 메시지는 `media_id`로 시작한다.
Gemini JSON이나 검색 기록을 4,000자로 자르지 않으며 JSON 파일도 첨부하지 않는다.
분할 지점은 줄이나 JSON 경계와 일치하지 않을 수 있다. 같은 게시물 ID의 메시지를 순서대로 읽는다.
일반 SNS 본문은 기존 방식대로 2,000자 이내로 줄이고, CloudWatch 알람은 embed 필드별 길이를 제한한다.

Lambda는 자신이 설정한 웹훅 주소와 토큰을 전송 본문에서 가린다.
모든 메시지에 `allowed_mentions={"parse": []}`를 넣어 멘션을 막고, `wait=true`로 전송 응답을 확인한다.

Discord 429는 `Retry-After` 헤더를 우선 읽고, 헤더가 없으면 본문의 `retry_after`를 읽는다.
유효한 대기 시간이 있으면 해당 메시지를 최대 두 번 다시 보낸다. 메시지 한 건의 누적 대기 상한은 5초다.
상한을 넘거나 대기 시간을 해석하지 못하면 실행을 실패로 남긴다. 다른 HTTP 오류와 연결 오류, 시간 초과도 실행 실패로 남긴다.
웹훅 URL과 응답 본문은 오류 메시지에 넣지 않는다.
여러 로그나 여러 문장 중 일부를 보낸 뒤 실패하면 재시도 시 중복 알림이 생길 수 있다.
`media_id`와 `started_at`으로 대조할 수 있지만 정확히 한 번 전송이나 중복 방지 저장소를 제공하지는 않는다.

구독 전달은 실시간 보장이 아니며 수집 지연이 추가된다. 재시도 가능한 전달 오류는 최대 24시간 재시도하지만
권한 등 일부 오류에서는 로그를 건너뛸 수 있다. 필터 조건을 바꿔도 과거 로그가 자동 재전송되지는 않는다.
CloudWatch 전송과 로그 이벤트 크기 제한도 적용되므로 운영 수집 경로에서 큰 진단이 온전히 도착하는지 확인한다.

전송 제한 대기는 [Discord 공식 문서](https://docs.discord.com/developers/topics/rate-limits)를 따른다.
설정과 입력 형식은 [CloudWatch Logs 구독 예제](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters.html),
전달 동작은 [구독 공식 문서](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Subscriptions.html)를 따른다.

## 로컬 테스트

저장소 최상위 폴더에서 실행한다. 추가 Python 패키지는 필요 없다.

```bash
python3 -m unittest discover -s Infra/lambda -p 'test_*.py'
```

[test_alerts_to_discord.py](test_alerts_to_discord.py)에 다음 3개 테스트가 있다.

| 검사 | 확인하는 동작 |
| --- | --- |
| 기존 SNS 알림 | CloudWatch 알람의 embed와 일반 SNS 문장 전송 |
| 실패 진단 | 운영 WARN/ERROR 진단의 값 전달, 일반 로그와 INFO 및 비운영 진단 제외. JSON 안의 로그 문구가 바뀌거나 없어도 처리 |
| 긴 메시지 | 분할한 각 메시지가 2,000자 이내인지, 원문이 보존되는지, 429 응답 뒤 재시도하는지 |

테스트는 로컬 HTTP 서버가 받은 요청을 확인한다. 실제 AWS 연결과 디스코드 채널 수신은 운영 반영 후 별도로 확인한다.
