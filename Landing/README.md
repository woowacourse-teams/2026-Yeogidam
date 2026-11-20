# 여기담 랜딩페이지

스프린트 2 제출 항목 3(랜딩페이지)에 맞춘 정적 페이지이며, 빌드 없이 `index.html`과 기능별 CSS, ES 모듈, `assets/` 폴더로 동작한다.

- 서비스 소개: 히어로(이름, 한 줄 설명, 누구의 어떤 문제를 푸는지)와 문제 공감 섹션
- 사용법: 히어로의 폰 프레임 데모(직접 눌러 보는 흐름)
- 시작하기: 히어로, 데모 마침 카드, 하단 시작하기 섹션의 App Store와 Google Play 배지(데스크톱에서는 QR 코드도 보인다)
- 기술력: 기능과 자주 묻는 질문 사이의 기술 섹션(스프린트 3 요구사항). 예시 릴스로 AI가 장소를 찾는 과정과 채점 숫자를 보여 준다
- 품질: 기술과 자주 묻는 질문 사이의 품질 섹션. 버전마다 세운 가설과 사용자에게 직접 확인한 결과를 보여 준다

## 로컬에서 보기와 검증

```bash
cd Landing
python3 -m http.server 8000
# http://localhost:8000
```

스크립트가 ES 모듈이라 파일을 `file://`로 바로 열면 브라우저가 스크립트를 막으므로 꼭 정적 서버로 연다. 폰트(Pretendard)와 QR 라이브러리는 외부 CDN에서 받고, 둘 다 못 받아도 페이지는 시스템 폰트로 동작하며 QR 영역만 숨긴다.

```bash
cd Landing
npm run verify
```

`verify`는 npm 패키지 없이 Node 내장 테스트 러너로 `tests/`를 돌린다(약 30초). 화면 테스트는 헤드리스 크롬을 DevTools 프로토콜로 띄워 데모, 기술 섹션, 품질 섹션, 스토어 링크, QR, 레이아웃을 확인하고, 외부 요청(GA, 글꼴, QR 라이브러리)은 막아서 방문 통계에 섞이지 않는다. 크롬은 Playwright의 `chrome-headless-shell`이나 설치된 Google Chrome을 찾고, 다른 곳에 있으면 `CHROME_PATH`로 알려 준다. `tests/`와 `package.json`은 `.vercelignore`로 배포에서 뺀다.

## 구성

| 영역 | 내용 |
|---|---|
| 내비 | 로고, 섹션 링크(데스크톱), 앱 받기 버튼 |
| 히어로 | 헤드라인, 설명, 스토어 배지, 폰 프레임 데모. 960px 이상은 글과 데모를 옆으로 두고, 그보다 좁으면 글을 가운데 정렬해 데모 위에 둔다 |
| 문제 공감 | 저장만 하고 잊는 세 장면 |
| 기능 | 지도, 주소 복사와 카카오맵, 출처 릴스, 검색과 정리 |
| 기술 | 예시 릴스로 AI가 장소를 찾는 과정, 채점 숫자와 측정 방법 |
| 품질 | 1.0부터 다음 버전까지 버전마다 세운 가설, 직접 써 본 사람 수, 결과와 바꾼 것 |
| 자주 묻는 질문 | 비용, 지원 영상, 실패 처리, 저장 범위, 지원 기기 |
| 시작하기 | 배지, QR 코드(900px 이상에서만) |
| 푸터 | 스토어 링크, 문의 안내, 쿠키 안내, 상표 표기, 저작권 |

### 파일 구조

함께 바뀌는 파일끼리 섹션 폴더에 두고, 여러 섹션이 같이 쓰는 것만 `shared/`에 둔다.

| 위치 | 내용 |
|---|---|
| `index.html` | 마크업, 메타 태그, GA 태그, JSON-LD |
| `main.js` | 섹션 모듈을 불러 붙이는 곳 |
| `page.css` | 스크립트 없는 섹션(히어로 문구, 문제 공감, 기능, FAQ, 시작하기) |
| `shared/` | `base.css`(토큰, 기본 요소, 내비, 버튼, 스토어 배지, 푸터), `analytics.js`(GA 전송), `motion.js`(움직임 줄이기), `store-links.js`(Play 꼬리표, store_click, QR) |
| `demo/` | 폰 데모의 `demo.css`, 동작 `demo.js`, 데이터 `reels.js`, 장소 범주 `categories.js`, 기다림 시간 `timing.js` |
| `tech/`, `journey/` | 기술 섹션과 품질 섹션의 CSS와 JS |
| `tests/` | `npm run verify`가 돌리는 테스트(배포 제외) |

`shared/`는 섹션 폴더를 가져다 쓰지 않고, 섹션 폴더끼리도 서로 가져다 쓰지 않는다(`tests/structure.test.mjs`가 막는다). 섹션 사이를 잇는 일, 예를 들어 스토어 클릭에 데모 진행 단계를 싣는 일은 `main.js`가 한다.

### 폰 데모의 흐름

데모는 `demo/demo.js`의 상태 하나로 움직이고, 화면 구성과 문구는 fe-release e6e5309(앱 2.3.0)에 맞췄다.

1. 릴스에서 공유를 누르면 공유 시트(「yeogidamm님의 게시물」)가 열린다.
2. 여기담을 누르면 화면 아래에 공유 카드(「공유 완료!」, 「앱에서 보기」)가 올라온다. 앱처럼 누르지 않으면 4초 뒤 닫히고, 그때는 홈 화면의 여기담 아이콘으로 앱을 연다.
3. 앱은 보관함으로 열리고, 최근 공유 링이 대기 중, 장소 찾는 중, 완료(장소 수)로 바뀐 뒤 게시물 카드가 담긴다.
4. 게시물 카드를 누르면 원본 사진 위에 「찾은 장소 N」 시트가 있는 게시물 상세가 열린다. 장소를 누르면 하단 탭 없는 장소 상세가 열린다.
5. 보관함으로 돌아가 「장소」 토글을 누르면 카테고리 칩 12개와 장소 목록이 보인다.
6. 지도 탭에서는 범주 아이콘이 든 핀과 칩 줄, 「장소」와 「폴더」 시트가 보이고, 핀을 누르면 시트 안에서 장소 상세가 열린다.

각 단계에서 다음에 누를 곳을 힌트 링과 말풍선으로 가리키고, 「자동으로 보기」를 켜면 같은 순서를 저절로 지나간다. 앱 기능 가운데 데모에 들여오지 않은 것은 처리 중 링을 눌렀을 때의 진행 화면, 히스토리 목록, 검색 패널, 편집 모드, 폴더 만들기이고, 누르면 토스트로 알린다.

데모에 쓰는 릴스와 장소는 `demo/reels.js`의 `REELS` 배열에 있다.

- `gunja`: 군자역 디저트 5곳이다. 실제 장소, 주소, 카카오 장소 URL과 작성자 `@yeogidamm`은 `Backend/src/main/resources/db/seed/data-onboarding.sql`의 온보딩 시드와 같고 사진은 운영 S3 썸네일을 쓴다.
- `chabap`: 여기담 계정의 게시물 `instagram.com/p/DebnmRckoy1`(강민경 차밥열끼 시즌8, 장소 8곳)이다. 장소는 캡션의 장소 이름을 카카오 로컬 검색으로 맞췄고 사진은 서버의 `KakaoPlaceMetaReader`와 같은 방법으로 각 카카오 장소 페이지의 미리보기 이미지를 받았다. 이름이 같은 가게가 여럿인 곳(홍춘, 보영만두, 김빠)은 가장 그럴듯한 지점을 골랐으므로 앱의 실제 분석 결과와 다를 수 있다.

장소를 바꾸려면 배열의 `name`, 범주 `code`(`demo/categories.js`의 11개 가운데 하나), `cat`, `road`, `lot`, `url`, 사진 `img`와 지도 위 위치 `x`, `y`(지도 영역 기준 백분율)를 고친다. `y`는 위쪽 검색창과 칩 줄, 아래 시트에 가리지 않게 24에서 43 사이에 둔다. 지도 배경은 `map` 값(`gunja` 또는 `metro`)으로 고르고 `mapSVG()`가 그리는 추상 지도라 실제 지형과 맞지 않는다.

### 기술 섹션

기술 섹션(`#tech`)은 캡션에 가게 이름이 없는 예시 릴스에서 AI가 캡션, 자막, 화면 속 글자를 차례로 읽고 카카오 지도 결과 카드를 띄우는 장면을 되풀이해 보여 주고, 옆에 채점 숫자를 둔다.

- 예시 릴스는 실제 게시물이 아니라 사용법 데모의 윤숲 후르츠산도점 사진(`assets/place-1775568752.jpg`)과 공식 계정 군자역 디저트 릴스의 구성을 빌려 만든 그림이다. 가게 이름은 캡션에서 빼고 자막의 지역 단서와 컵 글자에만 남겼고, 화면 아래에 "예시 화면이에요"를 둔다.
- 단계별 상태 문구와 렌즈 꼬리표는 스크립트의 `T_STEPS`에 있고, 렌즈가 멈추는 자리는 CSS의 `.tx-lens.at-cap`, `.at-sub`, `.at-cup`이 정한다. 사진을 바꾸면 컵 글자 위치가 달라지므로 `.at-cup` 값도 같이 맞춘다.
- 예시 화면이 화면에 30% 이상 보일 때만 움직이고, 움직임 줄이기 설정을 켠 방문자에게는 마지막 장면(찾은 결과 카드)만 보여 준다. 섹션까지 내려온 방문자와 측정 방법을 펼친 방문자는 GA4 이벤트 `tech_view`, `tech_method_open`으로 센다(방문 통계 절).
- 숫자(85%, 장소 133곳 중 113곳, 영상에만 나온 장소에서 놓친 곳 9곳 → 1곳)는 2026-10-13에 골든셋(공개 인스타그램 게시물 40건, 음식점과 카페 정답 133곳)을 gemini-3.5-flash-lite로 채점한 결과다. 캡션만 읽던 때 값은 2026-10-09 운영 코드의 예측을 같은 정답으로 다시 센 것이다.
- be-dev의 골든셋(`Backend/eval`)은 #411에서 음식점 밖 장소까지 넣어 다시 정의되어서, 133곳 기준 채점 결과는 아직 저장소에 없다. 숫자를 다시 재면 섹션의 숫자 두 개와 "측정 방법 보기" 목록을 같이 고친다.

### 품질 섹션

품질 섹션(`#journey`)은 1.0부터 지금까지 버전마다 세운 가설과, 처음 쓰는 사람과 고정 테스터에게 직접 써 보게 해서 확인한 결과를 보여 준다.

- 위에는 버전 번호(1.0, 1.1, 2.0, 2.1, 2.2, 2.3, 다음)를 한 줄로 늘어놓고, 마우스를 올리거나 누른 버전의 가설, 직접 써 본 사람, 본 것과 바꾼 것을 아래에 보여 준다. 처음에는 가장 최근 버전(2.3)이 열려 있고, 키보드는 왼쪽과 오른쪽 화살표로 옮긴다. 버전을 더하면 새 버전 버튼에 `aria-selected="true"`와 `tabindex="0"`, 내용에 `on`을 옮긴다.
- 테스트에 참여한 사람을 한 명에 점 하나로 그리고, 가설의 기준을 해낸 사람은 점을 채운다. 마크업에는 사람 수 `data-total`과 채울 수 `data-filled`만 두고 `journey/journey.js`가 점을 그린다(10명까지 한 줄, 넘으면 두 줄).
- 버전 날짜는 각 버전을 낸 날이다(2.0, 2.1, 2.2는 배포 커밋 날짜, 2.3은 fe-release에 머지해 OTA로 낸 날).
- 숫자는 팀의 사용성 테스트 기록(회의록)에서 가져왔다. 1.1은 군자역과 건대입구역 현장 검증(같은 불편을 겪은 19명 중 1명 설치), 2.0은 처음 쓰는 5명 테스트(처음 2명, 대기함을 없애고 다시 재서 4명), 2.1은 영상 가이드 테스트(5명 모두, 평균 실수 0.6번)다.
- 2.2는 11월 2일 회의록의 필터 전후 비교로, 전후 시간을 모두 잰 4명 중 3명이 빨라졌고 전후를 센 2명의 잘못 누른 핀이 21번에서 0번으로 줄어 성공으로 싣는다. 회의록에서는 기준인 9명 중 6명을 셀 수 없어 판정 불가로 정리했다. 2.3은 11월 9일 회의록의 보관함 개선 결과로, 고정 테스터 5명 중 4명이 빨라졌고 찾는 시간 중앙값이 1분 22초에서 26초로 줄었다.
- 2.3의 고정 테스터 말은 말한 분께 싣는 데 동의를 받았다.
- 모든 버전의 내용을 같은 자리에 겹쳐 두어서 버전을 바꿔도 아래 섹션이 밀리지 않는다. 버전을 더할 때는 `.jr-tabs`에 버튼 하나, `.jr-panels`에 내용 하나를 같은 `aria-controls`, `id`로 짝지어 넣고, `tests/journey.test.mjs`의 버전 목록과 점 개수를 같이 고친다.
- 섹션까지 내려온 방문자와 버전 내용을 처음 본 방문자는 GA4 이벤트 `journey_view`, `journey_version_open`으로 센다(방문 통계 절).

## 자산 출처

| 파일 | 출처 |
|---|---|
| `assets/character.png` | 피그마 화면 명세 파일의 `character` 심벌 원본(투명 배경) |
| `assets/marker-selected.png` | 옛 앱의 선택 핀(`map_marker_selected.png`)을 96px로 줄인 것. 품질 섹션 「다음」 칸에 쓴다 |
| `assets/category-*.svg` 11개 | fe-release의 지도 핀 안 범주 아이콘(`ios/Frontend/Images.xcassets/pin-category-*.imageset`) 그대로 |
| `assets/brand-mark.png`, `assets/instagram-logo.png` | fe-release의 검색창 왼쪽 아이콘(`src/assets/icons/brand-mark.png`)과 게시물 상세 「원본」 버튼 로고(32px로 줄임) |
| `assets/share-mascot.png`, `assets/empty-box.png` | fe-release의 공유 카드 마스코트(`ios/Shared/Images.xcassets/Mascot.imageset`, 96px)와 보관함 빈 결과 그림(`dami-empty-box-small-tight.png`, 218px) |
| `assets/app-icon.png` | 앱 아이콘(fe-dev의 `AppIcon.appiconset`과 같은 그림). 내비 로고와 192px 파비콘으로 쓴다 |
| `favicon.ico`, `assets/favicon-32.png`, `assets/apple-touch-icon.png` | 같은 앱 아이콘을 줄인 파비콘. 브라우저 탭과 iOS 홈 화면 아이콘용 |
| `assets/app-store-badge.svg` | Apple 배지 생성기에서 받은 한국어 공식 배지 |
| `assets/google-play-badge.png` | Google Play 한국어 공식 배지 |
| `assets/place-<카카오 장소 id>.jpg` 13장, `assets/reel-gunja.jpg`, `assets/reel-chabap.jpg` | 군자역 5곳은 운영 S3 썸네일, 차밥열끼 8곳은 카카오 장소 페이지 미리보기 이미지, 릴스 썸네일 둘은 여기담 계정 게시물의 표지(480px로 줄임). 장소 사진은 카카오 장소 사진이라 앱 밖에서 오래 쓸 때는 저작권을 한 번 더 확인한다 |

공식 배지는 비율과 색을 바꾸지 않고 App Store 배지를 먼저 두며 푸터에는 Apple과 Google 상표 표기가 있다.

## 바꿀 때 확인할 것

- 스토어 링크는 히어로, 데모 마침 카드, 시작하기, 푸터 네 곳과 QR 코드 두 곳에 있으므로 `id6801408355`와 `com.yeogidamm.app`으로 검색해 한 번에 고친다.
- `og:url`과 `og:image`는 https://yeogidam.vercel.app 기준 절대 주소라서 사이트 주소가 바뀌면 같이 고친다. 미리보기 이미지는 아직 앱 아이콘(192px)이라 1200x630 이미지를 따로 만들면 더 좋다.
- 외부 리소스는 Pretendard(jsDelivr), qrcode-generator(cdnjs), Google 태그(googletagmanager.com)이고 모두 받지 못해도 페이지는 깨지지 않는다.
- 데모 단계나 스토어 버튼 위치를 바꾸면 방문 통계 절의 이벤트 값, `demo/demo.js`의 `STEPS`와 `mark()` 호출, `shared/store-links.js`의 `placementOf()`, `tests/`의 기대값을 같이 고친다.
- JS 모듈을 더하거나 지우면 `index.html` 머리의 `modulepreload` 목록도 같이 고친다. 모듈은 import를 따라 차례로 받아서, 미리 받지 않으면 첫 화면이 늦게 갖춰진다(`tests/structure.test.mjs`가 목록을 확인한다).
- 데모 화면을 앱의 새 버전에 맞출 때는 fe-release 코드의 화면 문구와 크기를 기준으로 하고, `demo/categories.js`의 범주와 `demo/timing.js`의 기다림 시간을 먼저 본다.
- 저장소가 공개이므로 운영 주소, 비밀값, 개인정보를 Landing 폴더에 두지 않는다.

## 검색과 공유 미리보기

- head에 canonical, robots, Open Graph(`assets/og.png`, 1200x630), 트위터 카드, 앱 링크(`al:*`)와 iOS Smart App Banner(`apple-itunes-app`) 메타가 있다. 주소가 바뀌면 canonical과 `og:url`, `og:image`, `twitter:image`를 같이 고친다.
- 본문 끝에 JSON-LD(JSON for Linked Data, 검색 엔진이 읽는 구조화 데이터) 블록이 셋 있고 각각 앱 정보(MobileApplication), FAQ(FAQPage), 사이트(WebSite)를 다룬다. FAQPage 블록은 FAQ 섹션 문구와 같아야 하므로 섹션 문구를 고치면 JSON-LD도 같이 고친다.
- `robots.txt`와 `sitemap.xml`은 Landing 폴더 루트에 있고 페이지 내용이 크게 바뀌면 sitemap의 `lastmod`를 올린다.
- 검색 엔진 등록은 사람이 해야 하며 Google Search Console과 네이버 서치어드바이저에 주소를 등록하고 소유 확인 메타를 head에 넣은 뒤 sitemap 주소를 제출한다. 카카오톡 미리보기가 안 바뀌면 카카오 공유 디버거에서 캐시를 지운다.

## 방문 통계(GA4)

랜딩 방문과 데모 진행, 스토어 버튼 클릭, 기술 섹션과 품질 섹션 도달은 Google 애널리틱스 4(GA4) 속성 "Yeogidam Landing"으로 센다. 측정 ID `G-V0G6SC57DV`(둘째 자리는 숫자 0)는 페이지 소스에 공개되는 값이라 저장소에 그대로 둔다.

- head의 Google 태그(gtag.js)가 페이지 조회와 향상된 측정 이벤트(스크롤, 외부 링크 클릭 등)를 보낸다. 외부 링크 클릭 이벤트(`click`)에는 스토어 말고도 카카오맵, 인스타그램 링크가 섞이므로 스토어 클릭은 아래 `store_click`으로 센다.
- 스크립트는 아래 여섯 이벤트를 직접 보낸다. 데모와 스토어 이벤트를 보내는 코드는 `track()`, `mark()`, `placementOf()`와 스토어 링크 클릭 리스너에 있고, 기술 섹션과 품질 섹션 이벤트는 각 섹션 스크립트에 있다.

| 이벤트 | 보내는 때 | 매개변수 |
|---|---|---|
| `demo_step` | 데모가 다음 단계로 넘어갈 때. 페이지를 한 번 열면 같은 단계는 한 번만 보낸다. share는 공유 시트, send는 여기담 선택, open_app은 앱 열기, result는 게시물 상세, library는 보관함 「장소」 토글, map은 지도 탭, detail은 장소 상세, end는 끝 카드다 | `step`(share, send, open_app, result, library, map, detail, end), `mode`(tap 또는 auto) |
| `store_click` | App Store나 Google Play 링크를 누를 때 | `store`(app_store 또는 google_play), `placement`(hero, demo_end, start, footer), `demo_progress`(누른 시점까지 간 가장 먼 데모 단계, 시작 전이면 none) |
| `tech_view` | 기술 섹션의 예시 화면이 화면에 30% 이상 처음 보일 때. 페이지를 한 번 열면 한 번만 보낸다 | 없음 |
| `tech_method_open` | 기술 섹션의 "측정 방법 보기"를 처음 펼칠 때. 페이지를 한 번 열면 한 번만 보낸다 | 없음 |
| `journey_view` | 품질 섹션이 화면에 30% 이상 처음 보일 때. 페이지를 한 번 열면 한 번만 보낸다 | 없음 |
| `journey_version_open` | 품질 섹션의 버전 내용을 처음 볼 때(버전 번호를 누르거나 마우스를 0.5초 넘게 올렸을 때). 페이지를 한 번 열면 한 번만 보낸다 | `version`(1.0, 1.1, 2.0, 2.1, 2.2, 2.3, 다음) |

- 매개변수로 나눠 보려면 GA4의 관리, 데이터 표시, 맞춤 정의 순서로 들어가 이벤트 범위 맞춤 측정기준으로 등록해야 한다. `step`, `mode`, `store`, `placement`, `demo_progress`는 2026-10-21에, `version`(이름 '품질 섹션 버전')은 2026-11-02에 등록했다. 맞춤 측정기준은 등록한 뒤에 들어온 데이터에만 붙으므로 매개변수를 더하면 바로 등록한다.
- 유입 경로는 링크 끝에 붙이는 UTM 파라미터(유입 꼬리표)로 나누고, 어느 채널에서 왔는지는 `utm_source`에 채널 이름을 그대로 적는다. GA4에서는 첫 사용자 소스로 보면 채널별로 나뉜다. `utm_medium`은 모두 `social`로 맞춰 기본 채널 그룹에서 소셜 유입으로 잡히게 하고, `utm_campaign`은 같은 채널 안에서 홍보를 구분할 때만 쓴다.
- 팀원은 아래 팀원 확인 링크로 들어가 실험 숫자에 섞이지 않게 한다.

| 채널 | 링크 |
|---|---|
| 스레드 | `https://yeogidam.vercel.app/?utm_source=threads&utm_medium=social&utm_campaign=threads_profile` |
| 에브리타임 | `https://yeogidam.vercel.app/?utm_source=everytime&utm_medium=social&utm_campaign=everytime_post` |
| 인스타그램 | `https://yeogidam.vercel.app/?utm_source=instagram&utm_medium=social&utm_campaign=food_post_to_app` |
| 인스타그램 광고 | `https://yeogidam.vercel.app/?utm_source=instagram_ad&utm_medium=social&utm_campaign=caption_reel_boost` |
| 슬랙 | `https://yeogidam.vercel.app/?utm_source=slack&utm_medium=social&utm_campaign=slack_post` |
| SYDE | `https://yeogidam.vercel.app/?utm_source=syde&utm_medium=social&utm_campaign=syde_showcase` |
| 팀원 확인 | `https://yeogidam.vercel.app/?utm_source=test&utm_medium=internal&utm_campaign=test` |

- 스토어 버튼에도 스토어 통계용 꼬리표가 붙어 있어서, App Store Connect에서는 랜딩을 거친 설치를, Play Console에서는 랜딩에 들어온 채널별 설치를 볼 수 있다. App Store 버튼과 QR은 App Store Connect에서 만든 캠페인 `landing_store`로 가고, Google Play 버튼과 QR은 방문 주소의 `utm_source`와 `utm_medium`을 `referrer`에 옮겨 붙이며 꼬리표 없이 들어온 방문에는 `landing`과 `web`을 붙인다.
- 홍보 글에 스토어 링크를 바로 걸 때는 아래 링크를 쓴다. App Store 숫자는 캠페인마다 5명 이상 받아야 보이고, 캠페인을 만든 지 24시간 뒤부터 나온다.

| 채널 | App Store | Google Play |
|---|---|---|
| 스레드 | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=threads_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dthreads%26utm_medium%3Dsocial%26utm_campaign%3Dthreads_store` |
| 인스타그램 | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=instagram_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dinstagram%26utm_medium%3Dsocial%26utm_campaign%3Dinstagram_store` |
| 에브리타임 | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=everytime_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Deverytime%26utm_medium%3Dsocial%26utm_campaign%3Deverytime_store` |
| 슬랙 | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=slack_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dslack%26utm_medium%3Dsocial%26utm_campaign%3Dslack_store` |
| SYDE | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=syde_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dsyde%26utm_medium%3Dsocial%26utm_campaign%3Dsyde_store` |
| 랜딩페이지 버튼 | `https://apps.apple.com/app/apple-store/id6801408355?pt=129050582&ct=landing_store&mt=8` | `https://play.google.com/store/apps/details?id=com.yeogidamm.app&referrer=utm_source%3Dlanding%26utm_medium%3Dweb%26utm_campaign%3Dlanding_store` (방문 주소에 꼬리표가 있으면 `utm_source`와 `utm_medium`이 바뀐다) |

- 배포 뒤에는 GA4 보고서의 실시간 개요에서 이벤트 이름별 이벤트 수 카드에 `demo_step`, `store_click`, `tech_view`가 보이는지 확인한다. 표준 보고서는 하루 이틀 늦게 채워진다.
- `index.html`의 GA 태그는 내 컴퓨터 주소(localhost, 127.0.0.1, [::1])와 `file://`에서 `ga-disable-G-V0G6SC57DV`를 켜서 이벤트를 보내지 않는다. 그 전(2026-11-09까지)에 로컬에서 보낸 이벤트는 GA에 남아 있으므로 보고서를 볼 때 호스트 이름이 localhost나 127.0.0.1인 방문은 빼고 본다.
- 데스크톱 QR 코드로 스토어에 간 방문과 광고 차단기를 쓰는 브라우저의 방문은 GA4에 잡히지 않는다. QR에도 스토어 버튼과 같은 꼬리표를 넣어서 설치는 스토어 통계에서 볼 수 있다.
- 푸터에 Google 애널리틱스 쿠키 안내 문장이 있다. 앱 개인정보 처리방침(`Frontend/docs/terms-and-privacy.md`)은 아직 앱의 PostHog만 다룬다.

## 배포 선택지

지금은 Vercel 프로젝트 `yeogidam`에 배포되어 있다. 주소는 https://yeogidam.vercel.app 이고, Landing 폴더에서 `vercel deploy --prod`를 실행하면 다시 배포된다(`.vercel/`에 프로젝트 연결 정보가 있고 Git에는 올리지 않는다). 빌드 단계가 없어서 다른 곳으로 옮길 때도 Landing 폴더를 통째로 올리면 된다.

1. Vercel(권장): 가장 빠른 선택지이며 Landing 폴더에서 `npx vercel --prod`를 실행하면 `yeogidam.vercel.app` 같은 주소를 받고 HTTPS가 자동으로 붙는다. GitHub 연동으로 올리려면 프로젝트 설정에서 Root Directory를 `Landing`, Framework Preset을 Other로 두고 빌드 명령은 비워 둔다. 조직 저장소에 Vercel 앱 설치 권한이 없으면 CLI 배포가 편하다.
2. GitHub Pages: 저장소 설정에서 Pages 소스를 GitHub Actions로 두고 `actions/upload-pages-artifact`에 `path: Landing`을 주는 워크플로를 추가한다. 주소는 `https://woowacourse-teams.github.io/2026-Yeogidam/`이 된다. 조직 설정에서 Pages가 막혀 있으면 쓸 수 없다.
3. API 서버 nginx: `Infra/nginx/nginx.conf.template`에 `/`를 정적 파일로 주는 location을 추가하고 `/api/`만 Spring으로 넘긴다. 서비스 도메인 하나로 랜딩과 API를 같이 쓸 수 있지만 Infra 변경과 배포가 필요하다.
4. S3 공개 객체: 썸네일을 올리는 버킷의 `yeogidam/landing/` 아래에 `tests/`와 `package.json`을 뺀 Landing 폴더 파일을 올리고 `Content-Type`을 맞춘다. 주소가 길고 커스텀 도메인이 없다.

### Duck DNS 주소를 Vercel에 붙일 수 있나

붙일 수는 있지만 얻는 것이 적다. Duck DNS는 서브도메인 하나에 IP(A 레코드)와 TXT 레코드만 넣을 수 있고 CNAME 레코드는 못 넣는다. Vercel은 루트 도메인을 A 레코드 `76.76.21.21`로 받으므로, 새 Duck DNS 서브도메인을 하나 만들어 해당 IP를 넣고 Vercel 프로젝트의 Domains에 `xxx.duckdns.org`를 추가하면 인증서까지 발급된다. 다만 주소가 `vercel.app`보다 낫지 않고 Duck DNS는 집 IP용 서비스라 가끔 조회가 느리다. API 서버가 이미 쓰는 Duck DNS 주소는 Vercel로 돌리면 API가 끊기므로 건드리지 않는다. 랜딩과 API를 한 주소로 묶고 싶다면 3번(nginx)이 맞다.
