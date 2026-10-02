# 2026-10-01 개발 환경 카카오 로그인 503

스프린트 1 「운영 관찰과 대응」의 첫 사고 기록이다. 양식은 [observability.md](../observability.md)의 「사고 기록」 절을 따른다. 알람이 울린 사고가 아니라 사람이 먼저 본 사고이고, 관측 장치를 올린 날 그 장치로 원인을 읽은 첫 사례라 남긴다.

## 1. 감지 시각

- 발생: 2026-10-01 21:49 KST (UTC 12:49). 개발 서버 `yeogidam-dev`.
- 사람이 안 시각: 같은 시각. 백엔드 개발자가 스웨거로 `POST /api/v1/auth/logins/kakao`를 시험하다 응답 503(`AUTH503_002`, 제공자 설정 오류)을 받았다.

## 2. 알림 경로

- 알람은 울리지 않았다. `yeogidam-dev-app-error`의 기준은 5분에 ERROR 5건인데 이 요청은 ERROR 2줄(카카오 클라이언트 1줄, 예외 핸들러 1줄)이라 못 미쳤다.
- 응답 코드로 사람이 먼저 알았고, 대시보드 `yeogidam-observability`의 「최근 ERROR 로그」 테이블(21:4x 시각)에 두 줄이 올라와 있었다.
- 기준을 낮추지는 않는다. 1건에 울리면 배포마다 생기는 10초 502 구간에도 울려서 알림이 무뎌진다. 이런 "기준 미만의 단발 ERROR"는 로그 테이블에서 보는 것으로 둔다.

## 3. 원인

로그 테이블의 줄 하나가 원인을 그대로 말해 줬다.

```
[소셜 로그인 실패] provider=KAKAO, status=400, error=invalid_grant, detail=KOE303, code=null, mappedCode=AUTH503_002
```

`KOE303`은 카카오가 "토큰 교환 때 보낸 `redirect_uri`가 인가 요청 때 쓴 것과 다르다"고 돌려주는 코드다. 즉 브라우저로 인가 코드를 받을 때 쓴 `redirect_uri`와 서버 env(`/opt/yeogidam/backend.env`)의 `KAKAO_REDIRECT_URI`가 글자 단위로 달랐다. 앱(`OAuthClientErrorHandler`)은 KOE303을 설정 오류로 분류해 503으로 번역한다.

서버에 접속하지 않고 대시보드 한 화면에서 여기까지 읽었다. 로그가 JSON이라 `level="ERROR"` 필터가 먹었고, 같은 요청의 두 줄이 같은 `requestId`를 달고 있어서 한 요청인 것도 바로 보였다.

## 4. 조치

- 서버 env의 `KAKAO_REDIRECT_URI`를 인가 요청에 쓰는 값과 같게 고쳤다. 코드 변경은 없었다.
- env는 컨테이너를 만들 때만 읽히므로 컨테이너를 다시 만들어야 했다. 이날 `deploy.sh`는 "같은 이미지면 그대로 둔다"로 짜여 있고 지난 실행의 Re-run은 그 뒤에 들어온 문서 커밋 때문에 「오래된 실행」으로 거부되어, 서버에서 같은 옵션으로 `current` 이미지를 손으로 다시 띄웠다(약 5초 중단, 22:44 healthy).
- 조치 뒤 같은 요청을 보내니 503이 아니라 401(`AUTH401_002`, 코드가 틀림)로 끝나 5xx가 사라졌고 `AppError`는 0, 알람 7개는 OK였다.

## 5. 재발 방지

- 설정 쪽: `KAKAO_REDIRECT_URI`는 앱이 실제로 쓸 콜백 주소가 정해질 때 카카오 콘솔 등록값과 함께 다시 맞춘다. 지금 값은 스웨거 시험용이고 앱은 아직 스프링 로그인을 쓰지 않는다. 백로그는 [current-state.md](../current-state.md)에 있다.
- 배포 쪽: env만 바꿨을 때 사람이 `docker rm -f`를 하지 않도록 `deploy.sh`가 env 파일 sha256을 컨테이너 라벨로 남기고 다음 배포에서 다르면 같은 이미지라도 교체하게, 그리고 코드 변경 없이 재배포를 부를 수 있게 `workflow_dispatch`를 더한다(#267). 급할 때 쓰는 `Infra/scripts/restart-backend.sh`도 같은 PR에 둔다.
- 알람 쪽: 바꾸지 않는다. 이유는 2절에 적었다.

## 같은 날의 드릴

알림이 Discord까지 닿는지 보려고 두 환경에서 일부러 울렸다. 사고가 아니라 시험이므로 따로 기록하지 않고 여기에 붙인다.

| 환경 | 한 것 | 결과 |
| --- | --- | --- |
| prod | 로그인 경로에 가짜 인가 코드 6회 (22:20, 22:39) | 500 × 6. 약 1분 뒤 `yeogidam-prod-nginx-5xx`와 `yeogidam-prod-app-error`가 ALARM, Discord 빨간 embed와 메일 도착, 다음 5분 묶음에 OK 초록 메시지 |
| dev | 가짜 코드는 카카오가 거절해 401이라 5xx가 안 났다. 그래서 앱 컨테이너를 5초 멈추고 6회 요청 (22:44) | 502 × 6. `yeogidam-dev-nginx-5xx` ALARM. 앱이 없으니 `AppError`는 0 |

dev 결과가 설계 의도를 보여 준다. `Nginx5xx`는 사용자가 받은 응답을 세고 `AppError`는 앱 로그 레벨을 세므로, 앱이 죽어 502가 나는 경우는 nginx 쪽 알람만 잡는다. 둘을 같이 두는 이유다.
