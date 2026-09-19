package com.yeogidam.media.share;

import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlace;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlaceCandidate;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareResultE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares/";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_공유_결과를_조회하면_401이_발생한다() {
        // when & then
        given().when().get(PATH + 101)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 장소_분석_성공_결과와_장소_정보를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-success-user");
        insertMedia(jdbcTemplate, 201L, "성수동 카페 모음", "https://img.example.com/media.jpg", "@seongsu");
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        insertPlace(
                jdbcTemplate,
                301L,
                "첫 번째 카페",
                "https://img.example.com/place-1.jpg",
                "카페",
                "서울 성동구 성수동2가 315-11",
                "서울 성동구 연무장9길 4"
        );
        insertPlace(
                jdbcTemplate,
                302L,
                "두 번째 카페",
                "https://img.example.com/place-2.jpg",
                "카페",
                "부산 해운대구 중동 123-4",
                "부산 해운대구 해운대로 123"
        );
        insertPlaceCandidate(jdbcTemplate, 401L, 101L, 301L, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, 402L, 101L, 302L, "UNDECIDED");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 101)
                .then().statusCode(200)
                .body("sharedMediaId", equalTo(101))
                .body("sharedAt", equalTo("2026-09-17T01:00:00Z"))
                .body("thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("caption", equalTo("성수동 카페 모음"))
                .body("author", equalTo("@seongsu"))
                .body("extractionStatus", equalTo("SUCCEEDED"))
                .body("failureReason", equalTo(null))
                .body("originalUrl", equalTo("https://www.instagram.com/reel/fixture-101/"))
                .body("places", hasSize(2))
                .body("places[0].placeId", equalTo(301))
                .body("places[0].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("places[0].name", equalTo("첫 번째 카페"))
                .body("places[0].category", equalTo("카페"))
                .body("places[0].landLotAddress", equalTo("서울 성동구 성수동2가 315-11"))
                .body("places[0].roadAddress", equalTo("서울 성동구 연무장9길 4"))
                .body("places[1].placeId", equalTo(302))
                .body("places[1].thumbnailUrl", equalTo("https://img.example.com/place-2.jpg"))
                .body("places[1].name", equalTo("두 번째 카페"))
                .body("places[1].category", equalTo("카페"))
                .body("places[1].landLotAddress", equalTo("부산 해운대구 중동 123-4"))
                .body("places[1].roadAddress", equalTo("부산 해운대구 해운대로 123"));
    }

    @Test
    void 분석_중인_공유는_원본_주소와_진행_상태를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-extracting-user");
        insertMediaWithStatus(201L, null, null, null, "EXTRACTING", null);
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 101)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("EXTRACTING"))
                .body("failureReason", equalTo(null))
                .body("thumbnailUrl", equalTo(null))
                .body("caption", equalTo(null))
                .body("author", equalTo(null))
                .body("originalUrl", equalTo("https://www.instagram.com/reel/fixture-101/"))
                .body("places", hasSize(0));
    }

    @Test
    void 게시글에_접근하지_못한_실패_결과는_게시글_정보없이_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-content-unavailable-user");
        insertMediaWithStatus(
                201L,
                null,
                null,
                null,
                "FAILED",
                "CONTENT_UNAVAILABLE"
        );
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 101)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("FAILED"))
                .body("failureReason", equalTo("CONTENT_UNAVAILABLE"))
                .body("thumbnailUrl", equalTo(null))
                .body("caption", equalTo(null))
                .body("author", equalTo(null))
                .body("originalUrl", equalTo("https://www.instagram.com/reel/fixture-101/"))
                .body("places", hasSize(0));
    }

    @Test
    void 장소를_추출하지_못한_실패_결과는_게시글_정보와_실패_사유를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-place-not-extracted-user");
        insertMediaWithStatus(
                201L,
                "장소가 없는 게시글",
                "https://img.example.com/media.jpg",
                "@author",
                "FAILED",
                "PLACE_NOT_EXTRACTED"
        );
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 101)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("FAILED"))
                .body("failureReason", equalTo("PLACE_NOT_EXTRACTED"))
                .body("thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("caption", equalTo("장소가 없는 게시글"))
                .body("author", equalTo("@author"))
                .body("originalUrl", equalTo("https://www.instagram.com/reel/fixture-101/"))
                .body("places", hasSize(0));
    }

    @Test
    void 다른_회원의_공유_결과를_조회하면_404가_발생한다() {
        // given
        LoginResult owner = loginAsKakao("share-result-owner");
        LoginResult other = loginAsKakao("share-result-other");
        insertMedia(jdbcTemplate, 201L, "다른 회원 미디어", "https://img.example.com/media.jpg", "@owner");
        insertSharedMedia(jdbcTemplate, 101L, owner.memberId(), 201L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(other.accessToken())
                .when().get(PATH + 101)
                .then().statusCode(404);
    }

    @Test
    void 존재하지_않는_공유_결과를_조회하면_404가_발생한다() {
        // given
        LoginResult login = loginAsKakao("share-result-missing-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 999)
                .then().statusCode(404);
    }

    private void insertMediaWithStatus(
            Long mediaId,
            String caption,
            String thumbnailUrl,
            String author,
            String extractionStatus,
            String failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_url, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailUrl, author,
                extractionStatus, failureReason);
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
