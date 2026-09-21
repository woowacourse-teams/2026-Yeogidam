package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaFixture.createMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateFixture.createPlaceCandidate;
import static com.yeogidam.support.fixture.sql.PlaceFixture.createPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaFixture.createSharedMedia;
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

         createWaitingMedia(memberA.memberId(), 101L, 201L, 301L, 401L,
                timestamp("2026-09-17 10:00:00"));
        createWaitingMedia(memberB.memberId(), 102L, 202L, 302L, 402L,
                timestamp("2026-09-17 11:00:00"));

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
        createMedia(jdbcTemplate, 201L, "성수동 카페 모음", "https://img.example.com/media.jpg", "@seongsu");
        createSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        createPlace(jdbcTemplate, 301L, "첫 번째 카페", "https://img.example.com/place.jpg",
                "카페", "서울 성동구 성수동2가 315-11", "서울 성동구 연무장9길 4");
        createPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "UNDECIDED");

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
        createMedia(jdbcTemplate, 201L, DEFAULT_CAPTION, "https://img.example.com/media-201.jpg", DEFAULT_AUTHOR);
        createSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        createPlace(jdbcTemplate, 301L, "장소 301", "https://img.example.com/place-301.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 302L, "장소 302", "https://img.example.com/place-302.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 303L, "장소 303", "https://img.example.com/place-303.jpg", "카페",
                "서울 성동구 성수동");

        createPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "SAVED");
        createPlaceCandidate(jdbcTemplate, 402L, 101L, 302L, "DISCARDED");
        createPlaceCandidate(jdbcTemplate, 403L, 101L, 303L, "UNDECIDED");

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
        createMedia(jdbcTemplate, 201L, DEFAULT_CAPTION, "https://img.example.com/media-201.jpg", DEFAULT_AUTHOR);
        createSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        createPlace(jdbcTemplate, 301L, "장소 301", "https://img.example.com/place-301.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 302L, "장소 302", "https://img.example.com/place-302.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 303L, "장소 303", "https://img.example.com/place-303.jpg", "카페",
                "서울 성동구 성수동");

        createPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "SAVED");
        createPlaceCandidate(jdbcTemplate, 402L, 101L, 302L, "DISCARDED");
        createPlaceCandidate(jdbcTemplate, 403L, 101L, 303L, "SUPERSEDED");

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
        createMedia(jdbcTemplate, 201L, DEFAULT_CAPTION, "https://img.example.com/media-201.jpg", DEFAULT_AUTHOR);

        createPlace(jdbcTemplate, 301L, "장소 301", "https://img.example.com/place-301.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 302L, "장소 302", "https://img.example.com/place-302.jpg", "카페",
                "서울 성동구 성수동");

        createSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        createPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "SAVED");
        createPlaceCandidate(jdbcTemplate, 402L, 101L, 302L, "SUPERSEDED");

        createSharedMedia(jdbcTemplate, 102L, login.memberId(), 201L, timestamp("2026-09-17 11:00:00"));
        createPlaceCandidate(jdbcTemplate, 403L, 102L, 301L, "UNDECIDED");
        createPlaceCandidate(jdbcTemplate, 404L, 102L, 302L, "UNDECIDED");

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

        createWaitingMedia(login.memberId(), 101L, 201L, 301L, 401L,
                timestamp("2026-09-17 10:00:00"));
        createWaitingMedia(login.memberId(), 102L, 202L, 302L, 402L,
                timestamp("2026-09-17 11:00:00"));
        createWaitingMedia(login.memberId(), 103L, 203L, 303L, 403L,
                timestamp("2026-09-17 11:00:00"));

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
        createMedia(jdbcTemplate, 201L, DEFAULT_CAPTION, "https://img.example.com/media-201.jpg", DEFAULT_AUTHOR);
        createSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        createPlace(jdbcTemplate, 301L, "장소 301", "https://img.example.com/place-301.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 302L, "장소 302", "https://img.example.com/place-302.jpg", "카페",
                "서울 성동구 성수동");
        createPlace(jdbcTemplate, 303L, "장소 303", "https://img.example.com/place-303.jpg", "카페",
                "서울 성동구 성수동");

        createPlaceCandidate(jdbcTemplate, 403L, 101L, 301L, "UNDECIDED");
        createPlaceCandidate(jdbcTemplate, 401L, 101L, 302L, "UNDECIDED");
        createPlaceCandidate(jdbcTemplate, 402L, 101L, 303L, "UNDECIDED");

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

    private void createWaitingMedia(
            Long memberId,
            Long sharedMediaId,
            Long mediaId,
            Long placeId,
            Long candidateId,
            Timestamp createdAt
    ) {
        createMedia(jdbcTemplate, mediaId, DEFAULT_CAPTION,
                "https://img.example.com/media-" + mediaId + ".jpg", DEFAULT_AUTHOR);
        createSharedMedia(jdbcTemplate, sharedMediaId, memberId, mediaId, createdAt);
        createPlace(jdbcTemplate, placeId, "장소 " + placeId,
                "https://img.example.com/place-" + placeId + ".jpg", "카페",
                "서울 성동구 성수동");
        createPlaceCandidate(jdbcTemplate, candidateId, sharedMediaId, placeId, "UNDECIDED");
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
