# DAO 서브쿼리 감사: 도메인 규칙이 SQL로 흘러나갔는가 (task 16)

bean-fable의 DAO 여덟 개(InstagramMediaDao, MediaShareDao, MediaPlaceDao, SharePlaceDao, PlaceDao, SavedPlaceDao, MemberDao, MediaShareReportDao)에서 서브쿼리, 조인, 집계가 든 SQL을 전수 조사하고, 각 쿼리를 두 갈래로 판정했다. (a)는 영속화 계층의 정당한 사정(동시성 방어, 조회 투영, 단순 FK 해석)이고, (b)는 업무 규칙이 자바 코드 어디에도 선언되지 않고 SQL 문자열 안에만 사는 경우다. 판정 기준은 이 저장소의 층 원칙이다. 규칙의 선언은 도메인, 절차는 서비스, 동시성 방어와 기본값은 DB가 맡는다. 이 문서는 조사와 권고만 하며 코드는 바꾸지 않았다.

## 1. 쿼리별 판정표

단순 CRUD(단일 테이블 SELECT, INSERT, 단순 UPDATE)는 제외했다. MemberDao와 MediaShareReportDao, MediaPlaceDao는 전부 단순 CRUD라 표에 없다.

| # | 위치 | 형태 | 판정 | 근거 |
|---|---|---|---|---|
| 1 | InstagramMediaDao.failAllStuckExtracting | 조건부 UPDATE | (a) | 기동 시 고아 EXTRACTING 복구. 운영 방어 |
| 2 | InstagramMediaDao.updateToExtractingIfFailed | 조건부 UPDATE | (a) | "실패만 재시도"는 FailedExtraction.retry()에 이미 선언되어 있고, SQL은 동시 요청을 한 건만 통과시키는 이중 방어 |
| 3 | InstagramMediaDao.claimReprocess | 조건부 UPDATE(복합 조건) | (a) 절반, (b) 절반 | 선점 자체는 동시성 방어인데, 판정 조건 중 "처리 버전이 지난 게시물은 재추출 대상"이라는 규칙이 도메인에 없다. processing_version이 도메인 어휘가 아니어서 서비스의 isReusable과 이 SQL에만 산다 |
| 4 | MediaShareDao.findViewById, findAllByMemberId | INNER JOIN | (a) | 공유에 게시물 정보를 붙이는 단순 FK 해석. 조회 투영 |
| 5 | MediaShareDao.findAllSavedByPlaceForMember | 조인 3개 + 상관 MAX 서브쿼리 | **(b)** | "핀 상세의 원본 릴스 목록은 릴스당 최신 공유 한 건만 보여준다"는 업무 규칙이 SQL에만 있다. 자바 쪽에는 주석뿐이다 |
| 6 | MediaShareDao.findIdsWithoutCandidatesByMediaId | NOT EXISTS + 상관 MAX 서브쿼리 | **(b)** | "후보 발급은 후보 없는 공유 중 member별 최신 건에만"이라는 업무 규칙이 SQL에만 있다. 재공유 이중 노출 방지의 반쪽을 담당하는 규칙인데 자바에서 읽을 수 없다 |
| 7 | SharePlaceDao.issueCandidates | INSERT SELECT | (a) | 추출 사실을 후보로 복사하는 실행. "후보는 UNDECIDED로 태어난다"는 규칙은 스키마 기본값이 선언한다 |
| 8 | SharePlaceDao.updateDecisionStatus | 조건부 UPDATE | (a) | 교과서형 이중 방어. 규칙은 PlaceCandidate.decide에 선언되어 있고 SQL은 동시성만 막는다 |
| 9 | SharePlaceDao.supersedeUndecided | UPDATE + IN 서브쿼리 | (a) | 서브쿼리는 "그 member와 게시물의 공유들"이라는 FK 해석. 닫히는 대상이 미결정뿐이라는 규칙은 PlaceDecisionStatus javadoc과 ADR-02 결정 5에 선언되어 있고, 재공유가 닫는다는 절차는 서비스 attachShare의 순서에 있다(절차는 서비스라는 원칙에 부합) |
| 10 | SharePlaceDao.deleteAllByMediaId | IN 서브쿼리 | (a) | share 경유 정리라는 FK 해석 |
| 11 | PlaceDao.findAllByShareId, findAllFactsByMediaId | JOIN + ORDER BY position | (a) | 조회 투영. 다만 사실 조회가 NULL AS decision_status로 결정 칸을 빌려 쓰는 것은 Projection 재사용 편의이지 유출은 아니나, 사실과 해석을 가른 취지와는 결이 어긋나는 냄새다 |
| 12 | SavedPlaceDao.findAllViewsByMemberId | 조인 3개 + COUNT(DISTINCT media_id) + GROUP BY | (b) 경미 | "mediaCount는 같은 릴스를 두 번 세지 않는다"(운영 실측 규칙 3의 셈법)가 DISTINCT 한 단어에만 존재한다. #5와 같은 규칙의 다른 표현이라, 두 SQL이 어긋나게 수정되면 목록의 숫자와 상세의 목록이 모순된다 |
| 13 | SavedPlaceDao.deleteByMemberAndPlace | IN 서브쿼리 | (a) | FK 해석. "share_place의 SAVED 이력은 남긴다"는 규칙이 이 메서드가 share_place를 건드리지 않는다는 부재로 표현되는데, javadoc 선언이 있어 통과 |
| 14 | SavedPlaceDao.linkShare | DuplicateKeyException 삼킴 | (a) | 멱등 방어 |

집계하면 조사 대상 14건 중 (a)가 10건, (b) 확정이 2건(#5, #6), 절반 내지 경미한 (b)가 2건(#3, #12)이다.

## 2. (b) 항목을 도메인 언어로 끌어올린다면: as-is → to-be

수정은 하지 않았고 코드 모양만 스케치한다. to-be는 task 12와 13(Repository 포트, 매퍼 은닉)의 어휘를 전제한다.

### #6 후보 발급 대상 선정

as-is에서는 "후보 없는 공유 중 member별 최신 건"이라는 규칙이 상관 MAX 서브쿼리에만 있고, 자바 쪽은 결과 id 목록을 받아 실행만 한다.

```java
// ExtractionResultRecorder — 규칙을 모른 채 실행만 한다
private void issueCandidatesToWaitingShares(Long mediaId) {
    for (Long shareId : mediaShareDao.findIdsWithoutCandidatesByMediaId(mediaId)) {
        sharePlaceDao.issueCandidates(shareId, mediaId);
    }
}
```

```sql
-- MediaShareDao.findIdsWithoutCandidatesByMediaId — 규칙이 여기에만 산다
SELECT s.id FROM media_share AS s
WHERE s.media_id = ?
  AND NOT EXISTS (SELECT 1 FROM share_place AS sp WHERE sp.share_id = s.id)
  AND s.id = (SELECT MAX(latest.id) FROM media_share AS latest
              WHERE latest.media_id = s.media_id AND latest.member_id = s.member_id)
```

to-be에서는 선정을 도메인 일급 컬렉션이, 실행을 DAO가 맡는다. DAO 쿼리는 규칙 없는 단순 SELECT가 된다.

```java
// 도메인 — 규칙이 자바 메서드로 선언되어 단위 테스트가 가능해진다
public class SharedInstagramMedias {

    private final List<SharedInstagramMedia> shares;

    public List<Long> latestPerMemberWithoutCandidates() {
        Map<Long, SharedInstagramMedia> latestByMember = new LinkedHashMap<>();
        for (SharedInstagramMedia share : shares) {
            latestByMember.merge(share.memberId(), share, this::later);
        }
        return latestByMember.values().stream()
                .filter(SharedInstagramMedia::hasNoCandidates)
                .map(SharedInstagramMedia::id)
                .toList();
    }

    private SharedInstagramMedia later(SharedInstagramMedia left, SharedInstagramMedia right) {
        if (left.id() > right.id()) {
            return left;
        }
        return right;
    }
}
```

```java
// ExtractionResultRecorder — 도메인의 선정 결과를 집행한다
SharedInstagramMedias shares = sharedInstagramMediaRepository.findAllByMediaId(mediaId);
for (Long shareId : shares.latestPerMemberWithoutCandidates()) {
    sharePlaceDao.issueCandidates(shareId, mediaId);
}
```

```sql
-- DAO에 남는 쿼리 — FK 해석뿐
SELECT ... FROM media_share WHERE media_id = ?
```

예고된 규칙 변화(ADR-02 남은 결정: 이력 화면 요구가 생기면 지나간 공유에도 SUPERSEDED 후보를 발급)가 오면 latestPerMemberWithoutCandidates 한 메서드의 수정으로 끝난다. 쿼리는 한 번에서 두 번이 되지만 게시물당 공유 수가 소수라 비용이 미미하고, 선정과 실행 사이의 동시성 창은 지금 SQL 방식에도 똑같이 있어(새 공유 insert는 다른 트랜잭션) 차이가 없다.

### #5 핀 상세의 릴스당 최신 공유

as-is에서는 이중 조인이 든 상관 MAX 서브쿼리가 "릴스당 최신 공유 한 건"을 고른다.

```sql
-- MediaShareDao.findAllSavedByPlaceForMember
SELECT ... FROM media_share AS s
INNER JOIN instagram_media ...
INNER JOIN saved_place_share AS link ON link.share_id = s.id
INNER JOIN saved_place AS saved ON saved.id = link.saved_place_id
WHERE saved.place_id = ? AND saved.member_id = ?
  AND s.id = (SELECT MAX(latest.id) FROM media_share AS latest
              INNER JOIN saved_place_share AS latestLink ON latestLink.share_id = latest.id
              WHERE latestLink.saved_place_id = saved.id AND latest.media_id = s.media_id)
ORDER BY s.created_at DESC, s.id DESC
```

to-be에서는 PR 425의 최종 형태처럼 단순 조인으로 전부 가져오고 자바가 고른다.

```java
// SavedPlaceService — 오케스트레이션
public PlaceMediaResponses readSavedPlaceMedia(
        Long memberId,
        Long placeId
) {
    validateSavedForMember(memberId, placeId);
    List<MediaShareProjection> linked = mediaShareDao.findAllLinkedToSavedPlace(memberId, placeId);
    return PlaceMediaResponses.from(latestPerMedia(linked));
}

private List<MediaShareProjection> latestPerMedia(List<MediaShareProjection> shares) {
    Map<Long, MediaShareProjection> latestByMedia = new LinkedHashMap<>();
    for (MediaShareProjection share : shares) {
        latestByMedia.merge(share.mediaId(), share, this::later);
    }
    return List.copyOf(latestByMedia.values());
}
```

MediaShareProjection에는 mediaId가 이미 있어 준비물이 없다. 행 수가 그 장소를 저장하게 된 공유 수라 소량이고, 이중 조인이 든 상관 서브쿼리가 사라지며, "릴스 단위로 센다"는 규칙을 #12와 함께 자바 한 곳으로 모을 길이 열린다.

### #3 재추출 대상 판정

as-is에서는 "성공했고 버전이 현재면 재사용, 아니면 재추출"이라는 판정이 서비스의 isReusable과 claimReprocess의 WHERE 조건에 흩어져 있고, processing_version은 도메인 어휘가 아니다.

```java
// InstagramMediaService — record 필드를 직접 비교한다
private boolean isReusable(InstagramMediaRecord media) {
    String succeeded = ExtractionStatus.SUCCEEDED.name();
    return succeeded.equals(media.extractionStatus())
            && media.processingVersion() == ExtractionPipeline.PROCESSING_VERSION;
}
```

to-be에서는 task 12와 13에서 게시물 도메인이 버전을 들면 판정이 도메인 문장이 되고, 선점 UPDATE는 동시성 방어로 SQL에 남는다.

```java
// InstagramMedia — 판정이 도메인 어휘가 된다
public boolean isReusable(int currentVersion) {
    return extraction.isSucceeded() && processingVersion == currentVersion;
}
```

#12(mediaCount의 DISTINCT)는 집계라 SQL 유지가 실용적이고, #5를 오케스트레이션으로 바꾸는 경우 같은 규칙임을 두 자리에 주석으로 상호 참조시키는 정도가 알맞다.

## 3. 참고 PR(woowacourse/spring-roomescape-waiting #425)의 조립 방식

리뷰어(donghoony)의 지적 원문은 이렇다.

> 쿼리가 커지고 순번도 DB에서 채번하고 있네요. 순번의 규칙(비즈니스 로직)이 바뀌게 된다면 영향이 미치는 코드는 어디까지일까요? 예를 들어, `VIP 회원은 가장 앞에서 대기할 수 있다`라는 게 생긴다면 쉽게 대응하지 못할 것 같아요. 도메인 로직이 SQL에 담겨있지는 않은지 확인해보세요.

지적 당시 코드는 예약과 대기를 UNION ALL로 합치고 `ROW_NUMBER() OVER (PARTITION BY ...)`로 대기 순번까지 DB가 계산하는 한 방 쿼리였다. 작성자(kdongsu5509)는 비교 실험 후 이렇게 답했다.

> `단 한 번의 쿼리로 처리하는 것이 더 효율적일 것`이라 판단하여 서비스 계층의 일부 책임을 DB로 위임했습니다. 다만 코멘트를 받은 후 서비스 계층에서 직접 순번을 계산하는 방식과 비교 실험을 진행해보니, 윈도우 함수를 사용한 현재 방식은 데이터가 증가할수록 오히려 더 큰 비용이 발생한다는 것을 확인할 수 있었습니다. (중략) 서비스 계층에서 처리하더라도 구현 복잡도가 높지 않고 성능상 이점도 확인할 수 있었기 때문에, DB에 책임을 둘 필요가 없다고 판단했습니다.

최종 채택된 조립은 이렇다. 예약 목록과 대기 목록을 각각 단순 쿼리로 가져오고, 서비스가 슬롯별로 groupingBy 한 뒤 정렬된 대기열의 index + 1로 순번을 계산한다. 시간과 테마를 붙이는 단순 FK 조인은 그대로 남겼다. PR에는 세 방식(윈도우 함수 한 방, 의도적으로 나쁜 N+1 COUNT 채번, 분리 조회 + 자바 계산)을 네트워크 지연 시뮬레이션과 함께 비교한 실험 코드도 들어 있다.

정리하면 이 PR의 교훈은 "조인이 느리다"가 아니다. **규칙이 든 계산(채번)은 SQL에서 빼서 자바로 옮기고, 규칙 없는 FK 붙이기 조인은 유지한다**이다. "한 방 조인보다 서비스 오케스트레이션이 더 빠르다"는 기억은 이 PR의 실험에서 윈도우 함수 채번과 자바 계산을 비교했을 때 그랬다는 사실로 확인되며, 1차 논거는 성능이 아니라 규칙 변화 대응력(VIP 예시)이었다.

## 4. 종합 권고

우리 (b) 두 건은 PR 425가 지적받은 것과 같은 유형이다. "member별 최신 건에만 발급"과 "릴스당 최신 공유 한 건"은 상관 MAX 서브쿼리로 구현된 채번성 규칙이고, VIP 예시 같은 규칙 변화(발급 정책 변경은 ADR-02에 이미 예고되어 있다)가 오면 SQL 문자열을 고쳐야 한다.

| 후보 | 권고 | 성능 손익 | 규칙 선언 손익 |
|---|---|---|---|
| #6 발급 대상 선정 | task 12와 13에 합류시켜 도메인 선정 + DAO 실행으로 이관 | 쿼리 1회 증가(게시물당 공유 소수라 미미), 상관 서브쿼리 제거 | 규칙이 자바로 선언되어 단위 테스트 가능, 예고된 발급 정책 변화에 국소 대응 |
| #5 핀 상세 최신 공유 | 서비스 오케스트레이션(단순 조인 + groupingBy)으로 전환 | 행 수 소량, 이중 조인 든 상관 서브쿼리 제거 | #12와 같은 규칙을 자바 한 곳으로 모을 길 |
| #3 재추출 판정 | task 12와 13 때 isStale 판정만 도메인으로, 선점 UPDATE는 유지 | 변화 없음 | 버전 규칙이 도메인 어휘가 됨 |
| #12 mediaCount | SQL 유지, #5와 상호 참조 주석 | 해당 없음 | 집계는 SQL의 정당한 몫 |
| 나머지 (a) 10건 | 유지 | 해당 없음 | 조건부 UPDATE는 이중 방어, IN 서브쿼리는 FK 해석이라 원칙에 부합 |

결론은 권고에 그친다. 실행 시점은 task 12와 13(Repository 포트, 매퍼 은닉)과 한 흐름이 자연스럽다.
