# 상태를 enum 필드에서 상태 객체로: 추출 상태 모델링의 before와 after

여기담의 공유된 미디어(InstagramMedia)는 접수되는 순간 장소 추출이 시작되고 진행중, 성공, 실패라는 생애를 산다.
이런 생애에는 규칙이 붙어 있다. 성공한 미디어는 재시도할 수 없고 실패한 미디어만 재시도할 수 있으며, 성공에는 장소가 1개 이상 반드시 있어야 하고 실패에는 사유가 반드시 있어야 한다.
처음에는 상태를 enum 필드 하나로 관리했다. 그때 겪은 문제와 그 문제를 풀려고 상태를 객체로 추상화한 과정을 기록한다.

## Before: enum 필드로 관리하던 코드

```java
public class InstagramMedia {

    private final Long id;
    private final InstagramUrl instagramUrl;
    private ExtractionStatus status;                 // EXTRACTING, SUCCEEDED, FAILED
    private List<Place> places;                      // 성공일 때만 의미가 있음
    private ExtractionFailureReason failureReason;   // 실패일 때만 의미가 있음

    public InstagramMedia(InstagramUrl instagramUrl) {
        this.id = null;
        this.instagramUrl = instagramUrl;
        this.status = ExtractionStatus.EXTRACTING;
        this.places = List.of();
        this.failureReason = null;
    }

    public void succeed(List<Place> places) {
        if (status != ExtractionStatus.EXTRACTING) {
            throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
        }
        if (places == null || places.isEmpty()) {
            throw new IllegalArgumentException("성공한 미디어는 장소가 한 개 이상이어야 합니다.");
        }
        this.status = ExtractionStatus.SUCCEEDED;
        this.places = List.copyOf(places);
        this.failureReason = null;                   // 정리 코드
    }

    public void fail(ExtractionFailureReason reason) {
        if (status != ExtractionStatus.EXTRACTING) {
            throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
        }
        if (reason == null) {
            throw new IllegalArgumentException("실패한 미디어는 실패 사유가 필요합니다.");
        }
        this.status = ExtractionStatus.FAILED;
        this.failureReason = reason;
        this.places = List.of();                     // 정리 코드
    }

    public void retry() {
        if (status != ExtractionStatus.FAILED) {
            throw new RetryNotAllowedException("실패한 미디어만 다시 시도할 수 있습니다.");
        }
        this.status = ExtractionStatus.EXTRACTING;
        this.failureReason = null;                   // 정리 코드
    }

    public List<Place> selectPlaces(List<Long> placeIds) {
        if (status != ExtractionStatus.SUCCEEDED) {
            throw new UnselectablePlaceException("추출에 성공한 미디어에서만 장소를 고를 수 있습니다.");
        }
        // 이하 선택 검증
        return places.stream()
                .filter(place -> placeIds.contains(place.id()))
                .toList();
    }
}
```

동작은 하고 테스트도 통과한다. 그런데 세 가지 문제가 코드에 숨어 있었다.

### 문제 1. 전이 규칙이 if로 흩어진다

"실패한 미디어만 재시도할 수 있다"는 규칙은 retry 안의 if 한 줄이다. "성공에서만 장소를 고를 수 있다"는 selectPlaces 안의 if 한 줄이다. 실패 상태의 규칙 전체를 알고 싶으면 succeed, fail, retry, selectPlaces 네 메서드를 전부 읽으며 `!= FAILED`, `== FAILED`를 눈으로 수집해야 한다.

상태가 하나 늘면 문제가 커진다. 예를 들어 부분 성공(PARTIALLY_SUCCEEDED)을 추가한다면, 네 메서드의 if를 전부 다시 점검해야 하고 하나라도 빠뜨리면 새 상태가 기존 전이를 조용히 통과한다. 컴파일러는 아무것도 알려주지 않는다.

### 문제 2. 모순 상태를 컴파일러가 못 막는다

필드 셋(status, places, failureReason)이 서로 남남이라 정합성은 전이 메서드의 정리 코드에 달려 있다.
위 코드의 retry에서 `this.failureReason = null` 한 줄을 지워보면, 상태는 EXTRACTING인데 실패 사유가 남아 있는 미디어가 생긴다. 컴파일은 통과하고 테스트도 그 조합을 검사하지 않으면 통과한다. 증상은 한참 뒤 조회 화면에서, 진행중인 미디어에 실패 문구가 붙어 나오는 식으로 나타난다.

"성공인데 사유가 있다", "실패인데 장소가 남았다" 같은 조합은 도메인상 존재할 수 없는데, 타입은 그런 존재를 허용했다.

### 문제 3. 검증과 데이터가 남남이다

"성공에는 장소가 1개 이상"이라는 규칙은 succeed 안의 if다. 그런데 성공 상태와 장소 데이터가 각각 다른 필드라 규칙을 우회하는 길이 열려 있다. 새 전이 메서드를 추가하는 사람이 장소 검증을 빼먹으면, 장소 0개짜리 성공이 태어난다. 규칙이 데이터에 붙어 있지 않고 코드 경로에 붙어 있어서 생기는 일이다.

## 전환점: 문제의 공통 뿌리

세 문제의 뿌리는 하나였다. **행위마다 상태별로 답이 달라진다**. retry는 실패에서만 되고 selectPlaces는 성공에서만 되고 succeed와 fail은 진행중에서만 된다. 전이 4종에 상태 3종, 이런 조합의 답을 enum과 if로 적으면 조합 수만큼 분기가 생기고 분기마다 정리 코드가 따라붙는다.

조합이 있는 곳에는 다형성이 있다. 상태별로 답이 달라진다면 상태가 스스로 답하게 하면 된다.

## After: 상태를 객체로 추상화한 코드

상태를 인터페이스로 선언하고 상태마다 구현체를 하나씩 뒀다.

```java
public interface Extraction {

    ExtractionStatus status();

    Extraction succeed(ExtractedPlaces extractedPlaces);

    Extraction fail(ExtractionFailureReason failureReason);

    Extraction retry();

    ExtractedPlaces extractedPlaces();

    ExtractionFailureReason failureReason();
}
```

```java
public class InProgressExtraction implements Extraction {

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.EXTRACTING;
    }

    @Override
    public Extraction succeed(ExtractedPlaces extractedPlaces) {
        return new SucceededExtraction(extractedPlaces);
    }

    @Override
    public Extraction fail(ExtractionFailureReason failureReason) {
        return new FailedExtraction(failureReason);
    }

    @Override
    public Extraction retry() {
        throw new RetryNotAllowedException("추출이 진행 중인 미디어는 다시 시도할 수 없습니다.");
    }

    @Override
    public ExtractedPlaces extractedPlaces() {
        throw new UnselectablePlaceException("추출이 끝나지 않은 미디어에는 선택할 장소가 없습니다.");
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
```

```java
public class SucceededExtraction implements Extraction {

    private final ExtractedPlaces extractedPlaces;

    public SucceededExtraction(ExtractedPlaces extractedPlaces) {
        if (extractedPlaces == null) {
            throw new IllegalArgumentException("추출에 성공한 미디어는 장소가 필요합니다.");
        }
        this.extractedPlaces = extractedPlaces;
    }

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.SUCCEEDED;
    }

    @Override
    public Extraction succeed(ExtractedPlaces ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
    }

    @Override
    public Extraction retry() {
        throw new RetryNotAllowedException("추출에 성공한 미디어는 다시 시도할 수 없습니다.");
    }

    @Override
    public ExtractedPlaces extractedPlaces() {
        return extractedPlaces;
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return null;
    }
}
```

```java
public class FailedExtraction implements Extraction {

    private final ExtractionFailureReason failureReason;

    public FailedExtraction(ExtractionFailureReason failureReason) {
        if (failureReason == null) {
            throw new IllegalArgumentException("추출에 실패한 미디어는 실패 사유가 필요합니다.");
        }
        this.failureReason = failureReason;
    }

    @Override
    public ExtractionStatus status() {
        return ExtractionStatus.FAILED;
    }

    @Override
    public Extraction succeed(ExtractedPlaces ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
    }

    @Override
    public Extraction fail(ExtractionFailureReason ignored) {
        throw new InvalidExtractionTransitionException("이미 추출이 끝난 미디어입니다.");
    }

    @Override
    public Extraction retry() {
        return new InProgressExtraction();
    }

    @Override
    public ExtractedPlaces extractedPlaces() {
        throw new UnselectablePlaceException("추출에 실패한 미디어에는 선택할 장소가 없습니다.");
    }

    @Override
    public ExtractionFailureReason failureReason() {
        return failureReason;
    }
}
```

몸통은 상태 객체 하나만 들면 된다. 전이 메서드에서 if가 전부 사라진다.

```java
public class InstagramMedia {

    private final Long id;
    private final InstagramUrl instagramUrl;
    private Extraction extraction;

    public InstagramMedia(InstagramUrl instagramUrl) {
        this(null, instagramUrl, new InProgressExtraction());
    }

    public void succeed(ExtractedPlaces extractedPlaces) {
        this.extraction = extraction.succeed(extractedPlaces);
    }

    public void fail(ExtractionFailureReason failureReason) {
        this.extraction = extraction.fail(failureReason);
    }

    public void retry() {
        this.extraction = extraction.retry();
    }

    public List<Place> selectPlaces(List<Long> placeIds) {
        return extraction.extractedPlaces().selectBy(placeIds);
    }
}
```

## 문제가 어떻게 풀렸나

| Before의 문제 | After에서 |
|---|---|
| 전이 규칙이 if로 흩어짐 | 규칙이 구현체별로 응집. FailedExtraction 파일을 열면 실패 상태의 규칙이 전부 나온다. 상태를 추가하면 인터페이스가 구현할 메서드를 컴파일 에러로 전부 알려준다 |
| 모순 상태를 컴파일러가 못 막음 | 성공은 장소 없이, 실패는 사유 없이 생성 자체가 불가능하다. "성공인데 사유가 있다"는 조합을 표현할 타입이 없다. 정리 코드도 사라진다. 전이는 필드 셋을 고치는 게 아니라 객체를 통째로 갈아 끼우는 일이라 부분 갱신 실수가 없다 |
| 검증과 데이터가 남남 | 규칙이 코드 경로가 아니라 생성자에 붙는다. 어떤 경로로 만들어도 검증을 우회할 수 없다 |

부수 효과로 객체지향 생활체조의 else와 switch 금지가 소스 전체에서 자연히 지켜졌다. 상태 분기가 필요한 자리가 전부 다형성 호출로 대체됐기 때문이다.

## 그럼 ExtractionStatus enum은 왜 남아 있나

규칙은 전부 구현체에 있고 enum은 규칙이 하나도 없는 이름표다. 이름표가 필요한 자리는 도메인 밖 두 곳이다. 저장할 때는 객체를 DB에 넣을 수 없으니 구현체가 자기 이름표를 내주고 문자열이 되고, 되살릴 때는 문자열을 valueOf로 이름표로 바꾸면 이름표 상수가 자기 구현체를 만들어 돌려준다.

```java
public enum ExtractionStatus {

    EXTRACTING {
        @Override
        public Extraction toExtraction(Supplier<ExtractedPlaces> places, Supplier<ExtractionFailureReason> reason) {
            return new InProgressExtraction();
        }
    },
    SUCCEEDED {
        @Override
        public Extraction toExtraction(Supplier<ExtractedPlaces> places, Supplier<ExtractionFailureReason> reason) {
            return new SucceededExtraction(places.get());
        }
    },
    FAILED {
        @Override
        public Extraction toExtraction(Supplier<ExtractedPlaces> places, Supplier<ExtractionFailureReason> reason) {
            return new FailedExtraction(reason.get());
        }
    };

    public abstract Extraction toExtraction(Supplier<ExtractedPlaces> places, Supplier<ExtractionFailureReason> reason);
}
```

장소와 사유를 Supplier로 받는 이유는 지연 로딩이다. 성공일 때만 장소를 조회하고 실패일 때만 사유를 읽는데, 여기에도 조건문이 없다. 흐름 전체는 [구현체, 이름표, 문자열(DB), 이름표, 구현체]의 왕복이고 enum은 그 왕복의 다리다. 다리 위에는 규칙이 살지 않는다.

## 정직한 트레이드오프

이런 추상화가 공짜는 아니다. 클래스가 1개에서 5개(인터페이스 + 구현체 3 + 이름표 enum)로 늘었고 DB에서 되살릴 때 조립 지점(이름표의 toExtraction)이 필요하며, 상태 간 공통 로직이 생기면 구현체마다 반복될 수 있다.

그래서 판단 기준을 남긴다. 행위마다 상태별로 답이 달라지는 조합이 있을 때 상태 객체가 이득이고, 상태가 표시용 라벨일 뿐 행위가 갈리지 않는다면 enum 필드로 충분하다. 실제로 같은 프로젝트의 PlaceDecisionStatus(장소를 두고 내린 사용자 결정)는 전이 규칙이 SQL의 조건부 UPDATE 한 줄로 끝나는 수준이라 enum으로 뒀다. 같은 프로젝트 안에 두 방식이 공존하는 것 자체가 이런 기준을 적용한 결과다.

## STAR 요약

**Situation.** 수파베이스 백엔드를 자바 스프링으로 마이그레이션하며 공유된 인스타그램 미디어의 장소 추출 생애(진행중, 성공, 실패)를 도메인으로 모델링했다. 초기 설계는 enum 상태 필드에 장소 목록과 실패 사유 필드를 나란히 둔 형태였다.

**Task.** "성공은 재시도 불가, 실패만 재시도 가능, 성공에는 장소 필수, 실패에는 사유 필수"라는 전이 규칙 네 가지를, 상태 확인 if를 흩뿌리지 않고 모순 상태가 생길 수 없게 보장해야 했다. 팀 규칙(객체지향 생활체조)상 else와 switch도 쓸 수 없었다.

**Action.** 상태를 Extraction 인터페이스와 구현체 3개로 추상화해 전이 규칙을 각 상태 안에 응집시키고, 상태의 짝 데이터(장소, 사유)를 구현체 생성자의 필수 인자로 만들어 모순 조합을 타입 수준에서 차단했다. 영속화는 규칙 없는 이름표 enum이 담당하되, DB 문자열을 구현체로 되살릴 때 enum 상수가 자기 구현체를 만들고 Supplier로 필요한 데이터만 지연 조회하게 했다.

**Result.** 도메인 소스 전체에서 상태 확인 if와 else, switch가 사라졌고 "성공인데 사유가 있는" 류의 모순 상태는 표현할 타입 자체가 없어졌다. 상태별 규칙이 파일 단위로 모여서 이후 리뷰와 상태 추가 논의(UNDECIDED, DISCARDED 도입)에서 영향 범위를 구현체 단위로 좁혀 판단할 수 있었다.
