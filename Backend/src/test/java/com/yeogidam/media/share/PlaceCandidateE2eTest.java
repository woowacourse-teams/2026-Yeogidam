package com.yeogidam.media.share;

import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlace;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlaceCandidate;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.sql.Timestamp;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class PlaceCandidateE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/place-candidates";
    private static final String DEFAULT_CAPTION = "대기함 테스트 미디어";
    private static final String DEFAULT_AUTHOR = "@fixture_author_jii";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_대기함을_조회하면_401이_발생한다() {
        // when & then
        given().when().get(PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 로그인한_회원은_자신의_대기함만_조회한다() {
        // given
        LoginResult memberA = loginAsKakao("place-candidate-user-a");
        LoginResult memberB = loginAsKakao("place-candidate-user-b");
        insertWaitingMedia(memberA.memberId(), 101L, 201L, 301L, timestamp("2026-09-17 10:00:00"));
        insertWaitingMedia(memberB.memberId(), 102L, 202L, 302L, timestamp("2026-09-17 11:00:00"));

        // when
        List<Integer> sharedMediaIds = givenBearer(memberA.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(101);
    }

    @Test
    void 미결정_후보가_있는_공유와_장소_정보를_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertMedia(jdbcTemplate, 201L, "성수동 카페 모음", "https://img.example.com/media.jpg", "@seongsu");
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        insertPlace(
                jdbcTemplate,
                301L,
                "첫 번째 카페",
                "https://img.example.com/place.jpg",
                "카페",
                "서울 성동구 성수동2가 315-11",
                "서울 성동구 연무장9길 4"
        );
        insertPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "UNDECIDED");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].sharedMediaId", equalTo(101))
                .body("sharedMedias[0].thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("sharedMedias[0].caption", equalTo("성수동 카페 모음"))
                .body("sharedMedias[0].author", equalTo("@seongsu"))
                .body("sharedMedias[0].places", hasSize(1))
                .body("sharedMedias[0].places[0].placeId", equalTo(301))
                .body("sharedMedias[0].places[0].thumbnailUrl", equalTo("https://img.example.com/place.jpg"))
                .body("sharedMedias[0].places[0].name", equalTo("첫 번째 카페"))
                .body("sharedMedias[0].places[0].category", equalTo("카페"))
                .body("sharedMedias[0].places[0].landLotAddress", equalTo("서울 성동구 성수동2가 315-11"))
                .body("sharedMedias[0].places[0].roadAddress", equalTo("서울 성동구 연무장9길 4"));
    }

    @Test
    void 여러_상태가_섞인_공유에서는_미결정_후보만_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertSharedMediaWithCandidates(login.memberId(), 101L, 201L, timestamp("2026-09-17 10:00:00"),
                List.of(
                        new CandidateData(401L, 301L, "SAVED"),
                        new CandidateData(402L, 302L, "DISCARDED"),
                        new CandidateData(403L, 303L, "UNDECIDED")
                ));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].places", hasSize(1))
                .body("sharedMedias[0].places[0].placeId", equalTo(303));
    }

    @Test
    void 미결정_후보가_없는_공유는_반환하지_않는다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertSharedMediaWithCandidates(login.memberId(), 101L, 201L, timestamp("2026-09-17 10:00:00"),
                List.of(
                        new CandidateData(401L, 301L, "SAVED"),
                        new CandidateData(402L, 302L, "DISCARDED"),
                        new CandidateData(403L, 303L, "SUPERSEDED")
                ));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0));
    }

    @Test
    void 재공유된_이전_공유는_제외하고_최신_공유를_상단에_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertSharedMediaWithCandidates(login.memberId(), 101L, 201L, timestamp("2026-09-17 10:00:00"),
                List.of(
                        new CandidateData(401L, 301L, "SAVED"),
                        new CandidateData(402L, 302L, "SUPERSEDED")
                ));
        insertSharedMediaWithExistingPlaces(login.memberId(), 102L, 201L, timestamp("2026-09-17 11:00:00"),
                List.of(
                        new CandidateData(403L, 301L, "UNDECIDED"),
                        new CandidateData(404L, 302L, "UNDECIDED")
                ));

        // when
        List<Integer> sharedMediaIds = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(102);
    }

    @Test
    void 공유_시각_내림차순과_공유_식별자_내림차순으로_정렬한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertWaitingMedia(login.memberId(), 101L, 201L, 301L, timestamp("2026-09-17 10:00:00"));
        insertWaitingMedia(login.memberId(), 102L, 202L, 302L, timestamp("2026-09-17 11:00:00"));
        insertWaitingMedia(login.memberId(), 103L, 203L, 303L, timestamp("2026-09-17 11:00:00"));

        // when
        List<Integer> sharedMediaIds = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(103, 102, 101);
    }

    @Test
    void 장소_후보는_place_candidates_식별자_오름차순으로_정렬한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");
        insertSharedMediaWithCandidates(login.memberId(), 101L, 201L, timestamp("2026-09-17 10:00:00"),
                List.of(
                        new CandidateData(403L, 301L, "UNDECIDED"),
                        new CandidateData(401L, 302L, "UNDECIDED"),
                        new CandidateData(402L, 303L, "UNDECIDED")
                ));

        // when
        List<Integer> placeIds = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias[0].places.placeId", Integer.class);

        // then
        assertThat(placeIds).containsExactly(302, 303, 301);
    }

    @Test
    void 대기함이_비어_있으면_빈_목록을_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-candidate-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0));
    }

    private void insertWaitingMedia(
            Long memberId,
            Long sharedMediaId,
            Long mediaId,
            Long placeId,
            Timestamp createdAt
    ) {
        insertSharedMediaWithCandidates(memberId, sharedMediaId, mediaId, createdAt,
                List.of(new CandidateData(sharedMediaId + 300L, placeId, "UNDECIDED")));
    }

    private void insertSharedMediaWithCandidates(
            Long memberId,
            Long sharedMediaId,
            Long mediaId,
            Timestamp createdAt,
            List<CandidateData> candidates
    ) {
        insertMedia(jdbcTemplate, mediaId, DEFAULT_CAPTION,
                "https://img.example.com/media-" + mediaId + ".jpg", DEFAULT_AUTHOR);
        insertSharedMedia(jdbcTemplate, sharedMediaId, memberId, mediaId, createdAt);
        candidates.forEach(candidate -> insertPlace(jdbcTemplate, candidate.placeId(), "장소 " + candidate.placeId(),
                "https://img.example.com/place-" + candidate.placeId() + ".jpg", "카페",
                "서울 성동구 성수동"));
        insertPlaceCandidates(sharedMediaId, candidates);
    }

    private void insertSharedMediaWithExistingPlaces(
            Long memberId,
            Long sharedMediaId,
            Long mediaId,
            Timestamp createdAt,
            List<CandidateData> candidates
    ) {
        insertSharedMedia(jdbcTemplate, sharedMediaId, memberId, mediaId, createdAt);
        insertPlaceCandidates(sharedMediaId, candidates);
    }

    private void insertPlaceCandidates(
            Long sharedMediaId,
            List<CandidateData> candidates
    ) {
        candidates.forEach(candidate -> {
            insertPlaceCandidate(jdbcTemplate, candidate.candidateId(), sharedMediaId, candidate.placeId(),
                    candidate.decisionStatus());
        });
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }

    private record CandidateData(Long candidateId, Long placeId, String decisionStatus) {
    }
}
