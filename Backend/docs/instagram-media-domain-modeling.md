# media 패키지 도메인 모델링

사용자가 공유한 릴스와 그 릴스의 장소 추출 생애를 자바 객체로 어떻게 표현했는지, 왜 그렇게 나눴는지를 기록한다.
US-01(공유로 저장)을 구현하며 정리된 구조에 게시물과 공유 사건을 분리한 task 14까지 반영한 현행 구조다. 링크 판별 규칙은 ADR-01을 따르고 실패 사유는 운영에서 관측된 것을 기준으로 삼았다.

## 이 문서와 피그잼 다이어그램의 용어

- **짝 데이터**: 그 상태가 성립하려면 반드시 함께 있어야 하는 데이터다. 추출 성공의 짝은 추출된 장소 목록이고 실패의 짝은 실패 사유다. 기혼의 짝이 배우자이고 재직의 짝이 회사인 것과 같다. 생성자 필수 인자로 강제해서 "성공인데 장소 없음" 같은 모순 객체를 컴파일 단계에서 만들 수 없게 한다.
- **사실과 해석**: 추출 결과(ExtractedPlaces)는 파이프라인이 만든 사실이라 게시물에 두고 저장과 버림 결정은 사용자의 해석이라 공유 건의 후보(PlaceCandidate)에 둔다. 해석을 기록하려고 사실을 지우는 구현을 금지하는 원칙의 어휘다.
- **후보(PlaceCandidate)**: 공유 건에 발급된 결정 대상. 장소 사실과 결정 상태(UNDECIDED, SAVED, DISCARDED)의 쌍이다.
- **일급 컬렉션**: 리스트를 클래스로 감싸고 규칙(1개 이상 보장, 소속 검증)을 붙인 것이다.
- **다이어그램의 점선**: 집합체 경계를 넘는 id 참조(OwnerId, mediaId), 또는 인터페이스 구현 관계다.

## 전체 구조

집합체가 둘이다. 게시물(InstagramMedia)은 shortcode로 유일하고 추출 상태와 결과의 주인이며 사용자를 모른다. 공유 사건(MediaShare)은 특정 사용자가 게시물을 공유한 일 한 번이고 같은 게시물을 다시 공유해도 새 사건으로 쌓인다.

```
InstagramMedia                게시물 하나. 정체성, 표시용 내용, 추출 상태로 이루어지며 사용자와 공유 사건을 모른다
├── MediaShortcode            게시물 정체성. base64url 문자셋만 검증하고 길이는 고정하지 않는다
├── MediaMetadata             표시용 내용(제목, 캡션, 썸네일, 계정명). 들되 검증하지 않는다
└── Extraction                장소 추출이 어디까지 왔는지 (인터페이스)
    ├── InProgressExtraction  진행중. 재시도가 거부된다
    ├── SucceededExtraction   성공. 짝 데이터인 ExtractedPlaces 없이 만들어질 수 없다
    │   └── ExtractedPlaces   추출 사실의 일급 컬렉션. 장소 1개 이상을 보장하고 결정은 모른다
    └── FailedExtraction      실패. ExtractionFailureReason 없이 만들어질 수 없다

MediaShare                    공유 사건 하나. 재공유해도 새 사건으로 쌓여 이력이 남는다
├── OwnerId                   소유자. 집합체 경계를 넘는 id 참조
├── mediaId                   게시물. 집합체 경계를 넘는 id 참조
├── InstagramUrl              받은 원본(사실)을 보관하고 shortcode(해석)를 파싱한다. 동등성은 shortcode만 본다
└── PlaceCandidates           이 공유 건에 발급된 후보의 일급 컬렉션. 소속 검증과 결정(decidePlaces)을 안다
    └── PlaceCandidate        후보 하나. 장소 사실과 결정 상태(PlaceDecisionStatus)의 쌍
```

경계 쪽 객체는 media.service 패키지에 있다. InstagramContent는 인스타그램 조회 어댑터의 산출물이고 InstagramContentReader와 PlaceNameExtractor는 수집과 추출 단계의 포트 인터페이스다. 수집 포트의 입력은 shortcode다. 추출이 게시물 단위가 되면서 특정 공유의 URL에 의존할 이유가 없어졌다. DB 쪽 표현은 media.repository의 InstagramMediaRecord(게시물 행)와 MediaShareRecord, MediaShareView(공유 행과 게시물을 조인한 조회 투영)이고, 도메인으로 되살리는 조립 지점은 InstagramMediaReader 하나다. Reader는 공유 행에서 MediaShare를 조립하고(추출 성공 전에는 후보 없이), 게시물 행에서 InstagramMedia를 조립한다(성공이면 추출 사실까지).

## 객체별 책임

| 객체 | 형태 | 책임 |
|---|---|---|
| InstagramMedia | 클래스 | 게시물의 정체성(shortcode), 표시용 내용, 추출 상태를 묶고 succeed, fail, retry, fillMetadata 행동을 제공한다. 사용자와 공유 사건을 모른다 |
| MediaShare | 클래스 | 공유 사건. 소유자, 게시물 id 참조, 받은 원본(InstagramUrl), 발급된 후보를 들고 decidePlaces 행동을 제공한다. 추출이 끝나지 않은 공유는 후보가 없어 결정을 거부한다 |
| InstagramUrl | 클래스 | 사용자 입력을 다섯 사유(빈 값, 형식, 스킴, 호스트, 경로)로 검증하고 원본 문자열과 shortcode를 함께 보관한다. 동등성은 shortcode 기준이고 원본은 동등성에서 제외한다 |
| MediaShortcode | record | 게시물 식별자가 base64url 문자셋임을 보장한다. 길이는 고정하지 않는다 |
| MediaMetadata | record | 제목, 캡션, 썸네일, 계정명. 표시용이라 들되 검증하지 않는다 |
| OwnerId | record | 집합체 경계를 넘는 소유자 id 참조. null을 거부한다 |
| Extraction | 인터페이스 | 상태별 전이 규칙의 계약. 구현체 셋이 각자 자기 규칙을 안다 |
| InProgressExtraction | 클래스 | 성공과 실패로 가는 전이만 허용하고 재시도를 거부한다 |
| SucceededExtraction | 클래스 | 추출 사실 1개 이상과 함께만 태어난다. 모든 전이를 거부한다 |
| FailedExtraction | 클래스 | 실패 사유와 함께만 태어난다. 재시도만 허용한다 |
| ExtractedPlaces | 일급 컬렉션 | 추출 사실. 장소 1개 이상을 보장하고 결정은 모른다 |
| PlaceCandidates | 일급 컬렉션 | 공유 건에 발급된 후보 전부. 이 공유 건의 후보 중에서만 결정할 수 있다는 소속 규칙을 안다 |
| PlaceCandidate | 클래스 | 후보 하나. 장소 사실과 결정 상태의 쌍이고 결정은 UNDECIDED에서만 할 수 있다 |
| ExtractionStatus | enum | DB 문자열과 구현체 사이의 다리. 상수가 각자 자기 구현체를 만들어 조건문 없이 복원한다 |
| ExtractionFailureReason | enum | 실패 사유 4종과 사용자에게 보여줄 문구를 담는다 |
| InstagramMediaRecord | record | instagram_media 테이블 한 행. 게시물 전용이라 사용자와 원본 URL이 없다 |
| MediaShareRecord, MediaShareView | record | media_share 행과 게시물 조인 투영. 원본 URL과 공유 시각은 여기에 있다 |

## 왜 이렇게 나눴나

### 1. 게시물과 공유 사건을 나눈다

원래는 행 하나가 릴스이자 공유였다. 이 구조는 두 군데서 무너진다. 릴스는 하나인데 제목과 썸네일이 공유한 사람 수만큼 복제되어 재추출 시 갱신 대상이 모호해지고, 사용자마다 같은 shortcode 행이 있어야 하니 UNIQUE 제약을 걸 수 없어 "이미 추출된 릴스인가"를 조회로만 확인하게 된다(동시 공유가 그 틈에 추출을 두 번 돌린다). 그래서 릴스 행을 shortcode당 하나로 접고(uk_media_shortcode), 접으면서 갈 곳을 잃은 "누가 언제 어떤 URL로 공유했나"를 MediaShare가 사건으로 받아 공유할 때마다 쌓는다. 히스토리 화면은 내 공유 사건 목록의 투영이다.

접수는 두 걸음이 된다. shortcode로 게시물을 찾아서 있으면 공유만 붙이고(추출 성공본이면 후보를 즉시 발급, 실패나 구버전이면 조건부 UPDATE로 선점한 건만 다시 돌리고, 진행 중이면 도는 추출에 합류한다), 없으면 게시물을 만들고 추출을 보낸다. 동시 접수가 같은 게시물을 함께 넣으려는 경쟁은 늦은 쪽이 UNIQUE 위반을 삼키고 재조회해 먼저 들어간 행에 공유를 붙이는 폴백으로 끝난다. 중복 추출 방지가 조회 시점의 약속에서 DB 제약으로 격상된 것이다.

### 2. 후보는 공유 건에 귀속된다

저장이냐 버림이냐는 9월 1일 공유에서 내린 결정과 9월 8일 재공유에서 내릴 결정이 다를 수 있는, "누구의 몇 번째 공유"에 속한 값이다. 게시물이 전역 한 행이 되는 순간 (게시물, 장소)당 결정 칸은 하나뿐이라 여러 사용자와 여러 공유의 결정을 담을 수 없다. 그래서 추출 사실(media_place, 게시물당 한 벌)과 후보(share_place, 공유 건마다 발급)를 테이블부터 나눴다. 추출이 성공하면 후보가 없는 공유 전부에 사실을 복사해 UNDECIDED 후보를 발급하고 결정 전이는 후보 행의 조건부 UPDATE(WHERE decision_status = 'UNDECIDED')가 guard를 겸한다. 도메인에서는 MediaShare.decidePlaces가 소속 검증(이 공유 건의 후보 중에서만)을 거쳐 결정하며 추출이 끝나지 않은 공유는 후보가 아직 없어 결정 요청을 거부한다. 옛 모델에서는 진행 중 선택 거부를 Extraction 구현체가 맡았는데, 후보가 공유로 오면서 거부 지점도 함께 왔다.

### 3. InstagramMedia는 정체성, 표시용 내용, 추출 상태 셋으로 가른다

Place가 "내부 id + 외부 정체성(PlaceExternalSource) + 정보"인 것과 같은 구성이다. shortcode가 인스타그램 세계에서 이 게시물이 누구인지를 가리키는 정체성이자 동등성과 중복 판정의 키다. 추출 상태는 게시물 생애에서 유일하게 변하는 부분이라 따로 뒀다.

### 4. 상태를 enum 필드 대신 상태 객체로 둔 이유

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

- 전이 규칙이 if로 존재한다. retry, succeed, fail마다 상태 확인 if가 붙고 상태가 하나 늘면 모든 메서드의 if를 다시 점검해야 한다.
- 모순 조합이 가능하다. 필드 셋이 따로 놀아서 "성공인데 사유가 있다", "실패인데 장소가 남았다"를 컴파일러가 못 막는다. 전이 코드가 부속 필드 정리를 한 번 잊는 순간 데이터가 모순된다.
- 규칙이 흩어진다. "실패만 재시도할 수 있다"가 retry 안의 if 한 줄이라 실패 상태의 규칙 전체를 보려면 모든 메서드를 뒤져야 한다.

상태 객체로 바꾸면 셋이 뒤집힌다. 상태 확인 if가 다형성 호출로 대체되어 전이 규칙이 각 구현체 안에 모이고(FailedExtraction 파일을 열면 실패 상태의 모든 규칙이 한눈에 보인다), 짝 데이터가 생성자 필수 인자가 되어 모순 조합이 타입 수준에서 불가능해지며, 생활체조의 else와 switch 금지도 자연히 지켜진다. 행위가 많아서라기보다 **행위마다 상태별로 답이 달라지는 조합(전이 여러 종 × 상태 3종)이 있어서**다. 조합이 있는 곳에서 enum과 if는 조합 수만큼 분기를 낳고 다형성은 그 조합을 구현체 배치로 바꾼다.

### 4-1. 그럼 ExtractionStatus enum은 왜 같이 있나

**규칙은 전부 Extraction 구현체에 있고 ExtractionStatus는 규칙이 하나도 없는 이름표다.** 이름표가 필요한 자리는 도메인 밖 두 곳이다.

- 저장할 때. 객체를 DB에 넣을 수 없으니 구현체가 자기 이름표(status())를 내주고 문자열로 저장된다.
- 되살릴 때. 문자열을 valueOf로 이름표로 바꾸면 이름표 상수가 자기 구현체를 만들어 돌려준다(toExtraction). 추출 사실과 사유는 Supplier로 받아 성공일 때만 사실을 조회하고 실패일 때만 사유를 읽는다. 여기에도 조건문이 없다.

흐름으로 그리면 [구현체 → 이름표 → 문자열(DB) → 이름표 → 구현체]의 왕복이고 ExtractionStatus는 그 왕복의 다리다. 다리 위에는 규칙이 살지 않는다. 히스토리 조회가 문자열을 그대로 응답에 싣는 것도 이름표를 쓸 뿐 규칙을 쓰지는 않는다.

### 5. 상태와 짝 데이터는 함께 태어난다

성공은 추출 사실 없이, 실패는 사유 없이 만들어질 수 없다. 생성자가 불변식을 지키므로 "성공인데 사유가 있다"나 "실패인데 장소가 있다" 같은 모순 조합이 타입 수준에서 불가능하다. 필드 절반이 상태에 따라 null이 되는 한 덩어리 클래스와 갈리는 대목이다.

### 6. 도메인 예외는 스프링을 모른다

RetryNotAllowedException 등 도메인이 던지는 예외는 순수 DomainException을 상속하고 HTTP 상태 코드를 모른다. 400으로 변환하는 일은 웹 계층(GlobalExceptionHandler)의 몫이다. 우테코 미션처럼 콘솔 수준에서도 도메인이 통째로 돌아가야 한다는 목적 때문이다.

### 7. 표시용 값은 도메인이 들되 검증하지 않는다

처음에는 표시용 값을 도메인 밖(record)에만 뒀는데, 장기(java-janggi) 방식을 따라 도메인 관계를 먼저 완성하고 영속화할 값을 매퍼가 고르는 구조로 방향을 정하면서 원칙을 바꿨다. 제목, 캡션, 썸네일, 계정명은 MediaMetadata record로 게시물이 들되 검증하지 않는다. 원본 URL은 InstagramUrl이 직접 보관한다. 생성자가 원본(사실)을 받아 shortcode(해석)를 파싱하고 둘 다 들기 때문에 해석은 항상 그 원본의 해석이며 동등성은 shortcode만 본다. 처음에는 이 쌍을 SharedLink라는 별도 값 객체로 묶었는데, 원본과 해석을 따로 받는 생성자가 모순 쌍을 허용하는 구멍이 있어 러키와의 논의에서 InstagramUrl로 흡수했다. 게시물과 공유를 나누면서 소유자(OwnerId)와 InstagramUrl은 공유 행위의 사실이라 MediaShare로 옮겨 갔고 게시물에는 MediaShortcode만 남았다. 조회(히스토리, 상세)는 여전히 record에서 응답으로 바로 간다.

### 8. 원본 URL은 공유 행에 보관한다

받은 그대로의 sharedUrl을 media_share 행에 남긴다. 파싱은 해석이고 원본은 사실이라 실패 릴스의 "원본 릴스로 이동"과 향후 재처리의 근거가 된다. 같은 게시물이라도 한 사람은 /reel/ 경로로 다른 사람은 /p/ 경로로 들어올 수 있으니 원본은 게시물이 아니라 공유의 것이고 복원 시 공유 행의 sharedUrl로 InstagramUrl을 다시 만든다.

### 9. 실패 사유는 관측된 것부터 만든다

운영에서 관측된 실패 지점(원본 조회 실패, 장소 미추출, 지도 미매칭)에 예비용 UNEXPECTED를 더해 4종으로 시작했다. shortcode 길이를 고정하지 않은 ADR-01 결정 4와 같은 기준이며 사유가 관측되면 그때 늘린다.

### 10. 패키지 경계는 media 하나를 유지한다

구조를 두고 세 가지 물음이 있었고 결론은 모두 유지다.

**두 일급 컬렉션은 place가 아니라 media.domain에 둔다.** 일급 컬렉션의 자리는 규칙의 주인을 따른다. 사실 컬렉션(ExtractedPlaces)의 규칙("성공한 추출은 장소 1개 이상")과 후보 컬렉션(PlaceCandidates)의 규칙("이 공유 건의 후보 중에서만 결정한다")은 장소의 사정이 아니라 추출과 선택의 사정이다. 장소 표현이 바뀌어도 두 컬렉션은 안 바뀌고 추출과 선택 요구가 바뀌면 바뀐다. Place가 자기 출신(추출)을 모르는 채 순수하게 남는 것도 이 배치 덕분이다.

**media 안을 하위 도메인 패키지로 쪼개지 않는다.** 예전에 쪼개는 트리거로 "추출 결과가 미디어 하나에 종속되지 않는 독자 생명을 얻을 때"를 적어 뒀는데, task 14에서 그 순간이 실제로 왔고 답은 패키지 분리가 아니라 집합체 분리(InstagramMedia와 MediaShare)였다. 패키지는 여전히 media 하나가 "공유된 미디어와 그 생애"를 담고 전이 규칙 하나를 이해하는 데 두 패키지를 오갈 일이 없다. 남은 트리거는 유튜브 쇼츠 같은 두 번째 소스가 들어와 추출이 소스 공통 개념이 될 때다.

**패키지 이름은 media를 유지한다.** media 도메인의 정의가 "공유된 미디어와 그 생애"라 게시물과 공유 사건과 추출을 자연히 담는다. 두 번째 소스가 들어오면 InstagramMedia와 YoutubeMedia를 나란히 담는 그릇으로 오히려 더 잘 맞는다.

## 남은 결정

- 재시도 이력. 지금은 재시도가 이전 결과를 덮는다. 시도별 사유 이력이 필요해지면 Extraction이 불변이라 List로 늘리는 확장이 국소적이다.
- 재공유 시 이전 공유의 미결정 후보를 닫는 규칙. 지금은 재공유하면 새 후보가 발급되고 옛 공유의 UNDECIDED가 그대로 남아 대기함에 이중으로 보인다. 운영 앱 실측 규칙("이전 미결정은 이중으로 보이지 않는다")을 채우는 일은 task 15다.
- 보관함 실체화. 지도는 아직 share_place의 SAVED를 모으는 조회 투영이라 같은 장소를 여러 공유에서 저장하면 여러 번 센다. (user, place)당 한 행의 보관함 테이블은 task 15다.
- MediaShare라는 이름. 공유 한 건을 세는 SNS 어휘 그대로라 유지 중이고 Order와 Reservation 계보를 따라 Share로 줄이는 안이 있어 팀 논의 대상이다.
