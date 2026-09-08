# media 패키지 도메인 모델링

사용자가 공유한 릴스와 그 릴스의 장소 추출 생애를 자바 객체로 어떻게 표현했는지, 왜 그렇게 나눴는지를 기록한다.
US-01(공유로 저장)을 구현하면서 정리된 구조이며 링크 판별 규칙은 ADR-01을 따르고 실패 사유는 운영에서 관측된 것을 기준으로 삼았다.

## 이 문서와 피그잼 다이어그램의 용어

- **짝 데이터**: 그 상태가 성립하려면 반드시 함께 있어야 하는 데이터다. 추출 성공의 짝은 추출된 장소 목록이고 실패의 짝은 실패 사유다. 기혼의 짝이 배우자이고 재직의 짝이 회사인 것과 같다. 생성자 필수 인자로 강제해서 "성공인데 장소 없음" 같은 모순 객체를 컴파일 단계에서 만들 수 없게 한다.
- **사실과 해석**: 추출 결과(ExtractedPlaces)는 파이프라인이 만든 사실이라 게시물에 두고, 저장과 버림 결정은 사용자의 해석이라 공유 건의 후보(PlaceCandidate)에 둔다. 해석을 기록하려고 사실을 지우는 구현을 금지하는 원칙의 어휘다.
- **후보(PlaceCandidate)**: 공유 건에 발급된 결정 대상. 장소 사실과 결정 상태(UNDECIDED, SAVED, DISCARDED)의 쌍이다.
- **일급 컬렉션**: 리스트를 클래스로 감싸고 규칙(1개 이상 보장, 소속 검증)을 붙인 것이다.
- **다이어그램의 점선**: 집합체 경계를 넘는 id 참조(OwnerId, mediaId), 또는 인터페이스 구현 관계다.

## 전체 구조

```
InstagramMedia                        공유된 릴스 하나. 내부 식별자, 외부 정체성, 추출 상태로 이루어진다
├── InstagramUrl            외부(인스타그램) 정체성. 다섯 사유로 검증하고 shortcode를 추출한다
│   └── MediaShortcode      게시물 식별자. base64url 문자셋만 검증하고 길이는 고정하지 않는다
└── Extraction              장소 추출이 어디까지 왔는지 (인터페이스)
    ├── InProgressExtraction   진행중. 재시도와 장소 선택이 거부된다
    ├── SucceededExtraction    성공. ExtractedPlaces 없이 만들어질 수 없다
    │   └── ExtractedPlaces    일급 컬렉션. 1개 이상을 보장하고 선택 규칙을 안다
    └── FailedExtraction       실패. ExtractionFailureReason 없이 만들어질 수 없다
```

경계 쪽 객체는 media.service 패키지에 있다. InstagramContent는 인스타그램 조회 어댑터의 산출물이고 InstagramContentReader와 PlaceNameExtractor는 수집과 추출 단계의 포트 인터페이스다. DB 쪽 표현인 InstagramMediaRecord는 media.repository에 있고 도메인으로 되살리는 조립 지점은 InstagramMediaReader 하나다.

## 객체별 책임

| 객체 | 형태 | 책임 |
|---|---|---|
| InstagramMedia | 클래스 | 내부 식별자, 외부 정체성, 추출 상태를 묶고 succeed, fail, retry, selectPlaces 행동을 제공한다 |
| InstagramUrl | 클래스 | 사용자 입력을 다섯 사유(빈 값, 형식, 스킴, 호스트, 경로)로 검증하고 shortcode를 뽑는다. 동등성은 shortcode 기준이다 |
| MediaShortcode | record | 식별자가 base64url 문자셋임을 보장한다. 길이는 고정하지 않는다 |
| Extraction | 인터페이스 | 상태별 전이 규칙의 계약. 구현체 셋이 각자 자기 규칙을 안다 |
| InProgressExtraction | 클래스 | 성공과 실패로 가는 전이만 허용하고 재시도와 장소 접근을 거부한다 |
| SucceededExtraction | 클래스 | 장소 1개 이상과 함께만 태어난다. 모든 전이를 거부한다 |
| FailedExtraction | 클래스 | 실패 사유와 함께만 태어난다. 재시도만 허용한다 |
| ExtractedPlaces | 일급 컬렉션 | 장소 1개 이상을 보장하고 추출된 장소 중에서만 1개 이상 고르는 선택 규칙을 안다 |
| ExtractionStatus | enum | DB 문자열과 구현체 사이의 다리. 상수가 각자 자기 구현체를 만들어 조건문 없이 복원한다 |
| ExtractionFailureReason | enum | 실패 사유 4종과 사용자에게 보여줄 문구를 담는다 |
| InstagramMediaRecord | record | instagram_media 테이블 한 행. 제목, 썸네일, 계정명, 공유 시각, 원본 URL은 여기에만 있다 |

## 왜 이렇게 나눴나

### 1. InstagramMedia는 내부 식별자, 외부 정체성, 추출 상태 셋으로 가른다

Place가 "내부 id + 외부 정체성(PlaceExternalSource) + 정보"인 것과 같은 구성이다. InstagramUrl이 인스타그램 세계에서 이 릴스가 누구인지를 가리키고 그 안의 shortcode가 동등성과 중복 판정의 키다. 추출 상태는 릴스의 생애에서 유일하게 변하는 부분이라 따로 뒀다.

### 2. 상태를 enum 필드 대신 상태 객체로 둔 이유

enum 필드 하나로도 상태는 관리할 수 있다. 그 세계의 코드는 이렇게 된다.

```java
public class InstagramMedia {
    private ExtractionStatus status;
    private ExtractedPlaces places;          // 성공일 때만 값이 있음
    private ExtractionFailureReason reason;  // 실패일 때만 값이 있음

    public void retry() {
        if (status != ExtractionStatus.FAILED) {
            throw new RetryNotAllowedException("...");
        }
        this.status = ExtractionStatus.EXTRACTING;
        this.reason = null;                  // 부속 필드 정리를 잊으면 모순 상태가 남는다
    }
}
```

이 방식의 비용이 세 가지다.

- 전이 규칙이 if로 존재한다. retry, succeed, fail, selectPlaces마다 상태 확인 if가 붙고 상태가 하나 늘면 모든 메서드의 if를 다시 점검해야 한다.
- 모순 조합이 가능하다. 필드 셋이 따로 놀아서 "성공인데 사유가 있다", "실패인데 장소가 남았다"를 컴파일러가 못 막는다. 전이 코드가 부속 필드 정리를 한 번 잊는 순간 데이터가 모순된다.
- 규칙이 흩어진다. "실패만 재시도할 수 있다"가 retry 안의 if 한 줄이라 실패 상태의 규칙 전체를 보려면 모든 메서드를 뒤져야 한다.

상태 객체로 바꾸면 셋이 뒤집힌다. 상태 확인 if가 다형성 호출로 대체되어 전이 규칙이 각 구현체 안에 모이고(FailedExtraction 파일을 열면 실패 상태의 모든 규칙이 한눈에 보인다), 짝 데이터가 생성자 필수 인자가 되어 모순 조합이 타입 수준에서 불가능해지며, 생활체조의 else와 switch 금지도 자연히 지켜진다. 행위가 많아서라기보다 **행위마다 상태별로 답이 달라지는 조합(전이 4종 × 상태 3종)이 있어서**다. 조합이 있는 곳에서 enum과 if는 조합 수만큼 분기를 낳고 다형성은 그 조합을 구현체 배치로 바꾼다.

### 2-1. 그럼 ExtractionStatus enum은 왜 같이 있나

**규칙은 전부 Extraction 구현체에 있고, ExtractionStatus는 규칙이 하나도 없는 이름표다.** 이름표가 필요한 자리는 도메인 밖 두 곳이다.

- 저장할 때. 객체를 DB에 넣을 수 없으니 구현체가 자기 이름표(status())를 내주고 문자열로 저장된다.
- 되살릴 때. 문자열을 valueOf로 이름표로 바꾸면 이름표 상수가 자기 구현체를 만들어 돌려준다(toExtraction). 장소와 사유는 Supplier로 받아 성공일 때만 장소를 조회하고 실패일 때만 사유를 읽는다. 여기에도 조건문이 없다.

흐름으로 그리면 [구현체 → 이름표 → 문자열(DB) → 이름표 → 구현체]의 왕복이고 ExtractionStatus는 그 왕복의 다리다. 다리 위에는 규칙이 살지 않는다. 히스토리 조회가 문자열을 그대로 응답에 싣는 것도 이름표를 쓰는 것이지 규칙을 쓰는 것이 아니다.

### 3. 상태와 짝 데이터는 함께 태어난다

성공은 장소 없이, 실패는 사유 없이 만들어질 수 없다. 생성자가 불변식을 지키므로 "성공인데 사유가 있다"나 "실패인데 장소가 있다" 같은 모순 조합이 타입 수준에서 불가능하다. 필드 절반이 상태에 따라 null이 되는 한 덩어리 클래스와 갈리는 대목이다.

### 4. 도메인 예외는 스프링을 모른다

RetryNotAllowedException 등 도메인이 던지는 예외는 순수 DomainException을 상속하고 HTTP 상태 코드를 모른다. 400으로 변환하는 일은 웹 계층(GlobalExceptionHandler)의 몫이다. 우테코 미션처럼 콘솔 수준에서도 도메인이 통째로 돌아가야 한다는 목적 때문이다.

### 5. 표시용 값은 도메인이 들되 검증하지 않는다

처음에는 표시용 값을 도메인 밖(record)에만 뒀는데, 장기(java-janggi) 방식을 따라 도메인 관계를 먼저 완성하고 영속화할 값을 매퍼가 고르는 구조로 방향을 정하면서 원칙을 바꿨다. 제목, 썸네일, 계정명은 MediaMetadata record로 도메인이 들되 검증하지 않고, 원본 URL은 InstagramUrl이 직접 보관한다. 생성자가 원본(사실)을 받아 shortcode(해석)를 파싱하고 둘 다 들기 때문에 해석은 항상 그 원본의 해석이며, 동등성은 shortcode만 본다. 처음에는 이 쌍을 SharedLink라는 별도 값 객체로 묶었는데, 원본과 해석을 따로 받는 생성자가 모순 쌍을 허용하는 구멍이 있어 러키와의 논의에서 InstagramUrl로 흡수하기로 했다. 소유자는 OwnerId로 집합체 간 id 참조를 하고, 결정 상태는 ExtractedPlace(장소와 결정의 쌍)로 도메인 행위(decidePlaces)가 됐다. 조회(히스토리, 상세)는 여전히 record에서 응답으로 바로 간다.

### 6. 원본 URL은 record에 보관한다

받은 그대로의 sharedUrl을 instagram_media 행에 남긴다. ADR-01의 남은 결정이었던 자리인데, 파싱은 해석이고 원본은 사실이라 실패 릴스의 "원본 릴스로 이동"과 향후 재처리의 근거가 된다. 도메인에서는 InstagramUrl이 원본 문자열과 shortcode를 함께 들고, 복원 시 행의 sharedUrl로 InstagramUrl을 다시 만든다.

### 7. 실패 사유는 관측된 것부터 만든다

운영에서 관측된 실패 지점(원본 조회 실패, 장소 미추출, 지도 미매칭)에 예비용 UNEXPECTED를 더해 4종으로 시작했다. shortcode 길이를 고정하지 않은 ADR-01 결정 4와 같은 기준이며 사유가 관측되면 그때 늘린다.

### 8. 패키지 경계는 셋 다 현행을 유지한다

구조를 두고 세 가지 물음이 있었고 결론은 모두 유지다.

**ExtractedPlaces는 place가 아니라 media.domain에 둔다.** 일급 컬렉션의 자리는 규칙의 주인을 따른다. 이 컬렉션의 규칙 두 개("성공한 추출은 장소 1개 이상", "선택은 이 미디어에서 추출된 것 중에서만")는 장소의 사정이 아니라 추출과 선택의 사정이다. 장소 표현이 바뀌어도 이 컬렉션은 안 바뀌고 US-01의 추출과 선택 요구가 바뀌면 바뀐다. Place가 자기 출신(추출)을 모르는 채 순수하게 남는 것도 이 배치 덕분이다.

**media 안을 instagram과 extraction 하위 도메인으로 쪼개지 않는다.** Extraction은 미디어 옆의 형제 도메인이 아니라 미디어의 상태 필드다. 상태와 몸통을 찢으면 전이 규칙 하나를 이해하는 데 두 패키지를 오가게 되고 파이프라인과 서비스 사이에 패키지 순환이 생기며 도메인 클래스 열 개 규모에 3단 패키지는 과하다. 쪼개는 트리거는 두 개로 정해 둔다. 유튜브 쇼츠 같은 두 번째 소스가 들어와 추출이 소스 공통 개념이 될 때, 그리고 재시도 이력이나 추출 결과 전역 공유로 추출 결과가 미디어 하나에 종속되지 않는 독자 생명을 얻을 때다.

**패키지 이름은 media를 유지한다.** extraction을 형제로 보면 media가 좁아 보이지만 상태로 보면 media 도메인의 정의가 "공유된 미디어와 그 생애"가 되어 추출을 자연히 담는다. 패키지 이름이 집합체 루트(InstagramMedia)를 따르는 관례와도 맞고 두 번째 소스가 들어오면 InstagramMedia와 YoutubeMedia를 나란히 담는 그릇으로 오히려 더 잘 맞는다.

## 남은 결정

- 재시도 이력. 지금은 재시도가 이전 결과를 덮는다. 시도별 사유 이력이 필요해지면 Extraction이 불변이라 List로 늘리는 확장이 국소적이다.
- 중복 공유 처리. shortcode 동등성이 준비되어 있고 완료 추출 재사용은 다음 cycle에 한다.
