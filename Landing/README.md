# 여기담 랜딩페이지

스프린트 2 제출 항목 3(랜딩페이지)에 맞춘 정적 페이지다. 서버 없이 `index.html` 한 장과 `assets/` 폴더로 동작한다.

- 서비스 소개: 히어로(이름, 한 줄 설명, 누구의 어떤 문제를 푸는지)와 문제 공감 섹션
- 사용법: 히어로의 폰 프레임 데모(직접 눌러 보는 흐름)와 사용법 3단계 섹션(실제 앱 화면 캡처 포함)
- 시작하기: 히어로, 데모 마침 카드, 하단 시작하기 섹션의 App Store와 Google Play 배지(데스크톱에서는 QR 코드도 보인다)

## 로컬에서 보기

```bash
cd Landing
python3 -m http.server 8000
# http://localhost:8000
```

파일을 `file://`로 바로 열어도 보이지만, 폰트(Pretendard)와 QR 라이브러리는 외부 CDN에서 받으므로 인터넷 연결이 필요하다. 둘 다 못 받아도 페이지는 시스템 폰트로 동작하고 QR 영역만 숨겨진다.

## 구성

| 영역 | 내용 |
|---|---|
| 내비 | 로고, 섹션 링크(데스크톱), 앱 받기 버튼 |
| 히어로 | 헤드라인, 설명, 스토어 배지, 폰 프레임 데모 |
| 문제 공감 | 저장만 하고 잊는 세 장면 |
| 사용법 | 공유 → 분석 → 보관함과 지도 3단계, 공유 목록 추가 팁 |
| 기능 | 지도, 주소 복사와 카카오맵, 출처 릴스, 검색과 정리 |
| 자주 묻는 질문 | 비용, 지원 영상, 실패 처리, 저장 범위, 지원 기기 |
| 시작하기 | 배지, QR 코드(900px 이상에서만) |
| 푸터 | 팀, GitHub, 상표 표기 |

### 폰 데모의 흐름

데모는 `index.html` 끝의 스크립트에 있는 상태 머신 하나로 움직인다. 상태는 `feed → share → receiving → analyzing → lib → map → detail → end` 순서이고, 탭 바로 `lib`, `map`, `profile`을 오갈 수 있다. 각 단계에서 다음에 누를 곳을 힌트 링과 말풍선으로 가리키고, "자동으로 보기"를 켜면 같은 순서를 스스로 진행한다. "처음부터"와 릴스 칩은 상태를 초기화한다.

데모에 쓰는 릴스와 장소는 스크립트 맨 위 `REELS` 배열에 있다.

- `gunja`: 군자역 디저트 5곳. `Backend/src/main/resources/data-onboarding.sql`의 온보딩 시드와 같은 실제 장소, 주소, 카카오 장소 URL이고 사진은 운영 S3 썸네일이다. 작성자 `@yeogidamm`도 시드 그대로다.
- `gangneung`: 강릉 최일순짬뽕순두부 한 곳. 주소는 실제 앱 화면 캡처에 나온 값이고, 작성자와 캡션은 예시다.
- `dog`: 장소가 없는 영상. 실패 흐름을 보여 주는 예시다.

장소를 바꾸려면 배열의 `name`, `cat`, `road`, `lot`, `url`, 사진 `img`와 지도 위 위치 `x`, `y`(지도 영역 기준 백분율)를 고치면 된다. `img`가 없으면 이모지 타일로 그린다. 지도 그림은 `mapSVG()`가 그리는 추상 지도라 실제 지형과 맞지 않는다.

## 자산 출처

| 파일 | 출처 |
|---|---|
| `assets/character.png` | 피그마 화면 명세 파일의 `character` 심벌 원본(투명 배경) |
| `assets/marker.png` | 같은 파일의 `marker` 심벌 원본 |
| `assets/app-icon.png` | 앱 아이콘(fe-dev의 `AppIcon.appiconset`과 같은 그림). 내비 로고와 192px 파비콘으로 쓴다 |
| `favicon.ico`, `assets/favicon-16.png`, `assets/favicon-32.png`, `assets/apple-touch-icon.png` | 같은 앱 아이콘을 줄인 파비콘. 브라우저 탭과 iOS 홈 화면 아이콘용 |
| `assets/app-store-badge.svg` | Apple 배지 생성기에서 받은 한국어 공식 배지 |
| `assets/google-play-badge.png` | Google Play 한국어 공식 배지 |
| `assets/screen-library.jpg` | fe-dev `src/assets/guide/intro-library.png`를 줄인 실제 보관함 화면 |
| `assets/screen-map.jpg`, `assets/screen-sheet.jpg` | App Store에 올라간 1.1.0 스크린샷 |
| `assets/place-<카카오 장소 id>.jpg` 5장, `assets/reel-gunja.jpg` | 운영 S3에 저장된 군자역 장소 썸네일과 온보딩 릴스 썸네일(공개 주소에서 받아 480px로 줄임). 장소 사진은 카카오 장소 사진이라 앱 밖에서 오래 쓸 때는 저작권을 한 번 더 확인한다 |

공식 배지는 비율과 색을 바꾸지 않고 App Store 배지를 먼저 둔다. 푸터에 Apple과 Google 상표 표기가 있다.

## 바꿀 때 확인할 것

- 스토어 링크는 히어로, 데모 마침 카드, 시작하기, 푸터 네 곳과 QR 코드 두 곳에 있다. `id6801408355`와 `com.yeogidamm.app`으로 검색해 한 번에 고친다.
- `og:url`과 `og:image`는 https://yeogidam.vercel.app 기준 절대 주소다. 주소가 바뀌면 같이 고친다. 미리보기 이미지는 아직 앱 아이콘(192px)이라 1200x630 이미지를 따로 만들면 더 좋다.
- 외부 리소스는 Pretendard(jsdelivr)와 qrcode-generator(cdnjs) 둘뿐이다. 둘 다 없어도 페이지는 깨지지 않는다.
- 저장소가 공개이므로 운영 주소, 비밀값, 개인정보를 이 폴더에 두지 않는다.

## 배포 선택지

지금은 Vercel 프로젝트 `yeogidam`에 배포되어 있다. 주소는 https://yeogidam.vercel.app 이고, 이 폴더에서 `vercel deploy --prod`를 실행하면 다시 배포된다(`.vercel/`에 프로젝트 연결 정보가 있고 git에는 올리지 않는다). 다른 곳으로 옮길 때도 이 폴더를 통째로 올리면 된다. 빌드 단계가 없다.

1. Vercel(권장): 가장 빠르다. 이 폴더에서 `npx vercel --prod`를 실행하면 `yeogidam.vercel.app` 같은 주소를 받고 HTTPS가 자동으로 붙는다. GitHub 연동으로 올리려면 프로젝트 설정에서 Root Directory를 `Landing`, Framework Preset을 Other로 두고 빌드 명령은 비워 둔다. 조직 저장소에 Vercel 앱 설치 권한이 없으면 CLI 배포가 편하다.
2. GitHub Pages: 저장소 설정에서 Pages 소스를 GitHub Actions로 두고, `actions/upload-pages-artifact`에 `path: Landing`을 주는 워크플로를 추가한다. 주소는 `https://woowacourse-teams.github.io/2026-Yeogidam/`이 된다. 조직 설정에서 Pages가 막혀 있으면 쓸 수 없다.
3. API 서버 nginx: `Infra/nginx/nginx.conf.template`에 `/`를 정적 파일로 주는 location을 추가하고 `/api/`만 Spring으로 넘긴다. 서비스 도메인 하나로 랜딩과 API를 같이 쓸 수 있지만 Infra 변경과 배포가 필요하다.
4. S3 공개 객체: 썸네일을 올리는 버킷의 `yeogidam/landing/` 아래에 `index.html`과 `assets/`를 올리고 `Content-Type`을 맞춘다. 주소가 길고 커스텀 도메인이 없다.

### Duck DNS 주소를 Vercel에 붙일 수 있나

붙일 수는 있지만 얻는 것이 적다. Duck DNS는 서브도메인 하나에 IP(A 레코드)와 TXT만 넣을 수 있고 CNAME은 못 넣는다. Vercel은 루트 도메인을 A 레코드 `76.76.21.21`로 받으므로, 새 Duck DNS 서브도메인을 하나 만들어 그 IP를 넣고 Vercel 프로젝트의 Domains에 `xxx.duckdns.org`를 추가하면 인증서까지 발급된다. 다만 주소가 `vercel.app`보다 낫지 않고, Duck DNS는 집 IP용 서비스라 가끔 조회가 느리다. 이미 API 서버가 쓰는 Duck DNS 주소를 Vercel로 돌리면 API가 끊기므로 그 주소는 건드리지 않는다. 랜딩과 API를 한 주소로 묶고 싶다면 3번(nginx)이 맞다.
