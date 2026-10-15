# 장소 추출 골든셋 평가

## 무엇을

골든셋은 정답을 미리 적어 둔 인스타그램 게시물 묶음이다. `golden/cases.csv`에 게시물 링크 40개와 각 게시물에서 나와야 할 카카오 장소 ID(모두 133곳)를 적어 두었고, 채점기는 이 게시물들을 운영 파이프라인으로 돌려 몇 곳을 맞혔는지 센다.

게시물은 다섯 종류를 섞었다.

| kind | 뜻 | 건수 |
|---|---|---|
| caption | 캡션에 장소 이름이 있다 | 9 |
| video | 캡션에는 이름이 없고 영상 자막이나 말소리에만 있다 | 11 |
| image | 사진이나 캐러셀 게시물이라 이미지 글자에만 있다 | 6 |
| multi | 정답 장소가 3곳 이상인 모음 게시물 | 6 |
| none | 저장할 장소가 없는 게시물. 장소를 소개하지 않거나(광고, 상품 후기) 소개한 가게가 카카오에 없는 경우(노점)이고, 없는 장소를 지어내거나 다른 가게를 대신 붙이지 않는지 본다 | 8 |

종류는 "무엇을 저장해야 하나"로 나눈다. 정답이 비어 있으면 none이고, none이 아니면 정답이 있어야 한다. `run_eval.py`가 읽을 때 이 규칙을 검사한다.


정답과 정하는 규칙은 `golden/verification-20261010.md`에 있다. 작성자 계정명은 넣지 않았다.

## 어떻게

```
cd Backend
./gradlew evalTest --no-daemon
./gradlew evalTest --no-daemon -Deval.cases=C016,C022   # 몇 건만 돌려 콘솔로 본다
```

- 자바 채점기(`GoldenSetEvalTest`)가 운영 빈(`InstagramMediaHtmlReader`, `InstagramMediaDownloader`, `GeminiPlaceNameExtractor`, `KakaoPlaceSearcher`)을 운영과 같은 설정으로 만들어 `MediaExtractionPipeline`과 같은 순서로 돌리고 `results/summary.md`를 쓴다. DB와 S3를 쓰지 않는 것만 운영과 다르다.
- 한 번 돌리면 캡션 단계에서 멈췄을 때와 영상, 사진까지 읽었을 때를 같은 응답으로 함께 센다. "개선 전" 열은 `results/before.json`(2026-10-09에 be-dev 운영 그대로 받은 예측)을 지금 정답으로 다시 센다.
- 건별 경로와 Gemini 단서는 콘솔에 찍힌다. `-Deval.cases`로 몇 건만 돌리면 `summary.md`는 덮어쓰지 않는다.
- 채점은 예측한 카카오 장소 ID와 정답 ID를 견준다. 맞힌 장소, 틀리게 뽑은 장소(정답에 없는데 뽑은 곳), 카카오 API 미제공(카카오맵 웹에만 있어 REST로 맞힐 수 없는 정답)을 센다.
- 키는 `Backend/.env`의 `GEMINI_API_KEY`, `GEMINI_MODEL`, `KAKAO_CLIENT_ID`, `GEMINI_API_KEY_FALLBACKS`(결제 key, 쉼표로 여러 개)를 읽는다. 운영처럼 `GEMINI_API_KEY`가 한도에 걸리면 결제 key로 넘긴다. 키는 어디에도 적지 않는다.
- 40건에 10분 안팎이 걸린다.

### 파이썬 실험 도구

`run_eval.py`는 운영에 없는 입력(댓글, 위치 태그, 영상만)을 시험할 때 쓴다. 입력을 `yt-dlp`로 받고 결과를 `results/<variant>.json`에 남기며, 변형 비교표는 화면에만 찍고 `summary.md`는 건드리지 않는다.

```
python3 run_eval.py --variant both --env-file ../.env
python3 run_eval.py --summary-only
```

## 왜

바꾸기 전과 후를 같은 정답으로 재야 바꾼 것이 효과가 있었는지, 오히려 나빠지지 않았는지 알 수 있다. 외부 API를 부르므로 CI에서는 돌리지 않고 파이프라인을 바꿀 때 손으로 돌린다.
