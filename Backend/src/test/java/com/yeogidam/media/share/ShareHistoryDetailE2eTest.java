package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.createMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.createSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.media.share.exception.ShareErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareHistoryDetailE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares/";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_공유_결과를_조회하면_401_예외를_던진다() {
        // when & then
        given().when().get(PATH + 1)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 장소_분석_성공_결과와_장소_정보를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-success-user");
        createMedia(jdbcTemplate, 1L, "성수동 카페 모음", "https://img.example.com/media.jpg", "@seongsu");
        createSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));
        insertPlace(
                jdbcTemplate,
                1L,
                "kakao-fixture-1",
                "첫 번째 카페",
                "카페",
                "서울 성동구 성수동2가 315-11",
                "서울 성동구 연무장9길 4",
                new BigDecimal("37.5446"),
                new BigDecimal("127.0559"),
                "https://place.map.kakao.com/1",
                null,
                "https://img.example.com/place-1.jpg",
                null,
                null
        );
        insertPlace(
                jdbcTemplate,
                2L,
                "kakao-fixture-2",
                "두 번째 카페",
                "카페",
                "부산 해운대구 중동 123-4",
                "부산 해운대구 해운대로 123",
                new BigDecimal("35.1631"),
                new BigDecimal("129.1635"),
                "https://place.map.kakao.com/2",
                null,
                "https://img.example.com/place-2.jpg",
                null,
                null
        );
        insertUndecidedCandidate(jdbcTemplate, 1L, 1L, 1L);
        insertUndecidedCandidate(jdbcTemplate, 2L, 1L, 2L);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(200)
                .body("sharedMediaId", equalTo(1))
                .body("sharedAt", equalTo("2026-09-17T01:00:00Z"))
                .body("thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("caption", equalTo("성수동 카페 모음"))
                .body("author", equalTo("@seongsu"))
                .body("extractionStatus", equalTo("SUCCEEDED"))
                .body("failureReason", equalTo(null))
                .body("sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("places", hasSize(2))
                .body("places[0].placeId", equalTo(1))
                .body("places[0].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("places[0].name", equalTo("첫 번째 카페"))
                .body("places[0].category", equalTo("카페"))
                .body("places[0].landLotAddress", equalTo("서울 성동구 성수동2가 315-11"))
                .body("places[0].roadAddress", equalTo("서울 성동구 연무장9길 4"))
                .body("places[1].placeId", equalTo(2))
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
        insertMediaWithStatus(1L, null, null, null, "EXTRACTING", null);
        createSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("EXTRACTING"))
                .body("failureReason", equalTo(null))
                .body("thumbnailUrl", equalTo(null))
                .body("caption", equalTo(null))
                .body("author", equalTo(null))
                .body("sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("places", hasSize(0));
    }

    @Test
    void 게시글에_접근하지_못한_실패_결과는_게시글_정보없이_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-content-unavailable-user");
        insertMediaWithStatus(
                1L,
                null,
                null,
                null,
                "FAILED",
                "CONTENT_UNAVAILABLE"
        );
        createSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("FAILED"))
                .body("failureReason", equalTo("CONTENT_UNAVAILABLE"))
                .body("thumbnailUrl", equalTo(null))
                .body("caption", equalTo(null))
                .body("author", equalTo(null))
                .body("sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("places", hasSize(0));
    }

    @Test
    void 장소를_추출하지_못한_실패_결과는_게시글_정보와_실패_사유를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-result-place-not-extracted-user");
        insertMediaWithStatus(
                1L,
                "장소가 없는 게시글",
                "https://img.example.com/media.jpg",
                "@author",
                "FAILED",
                "PLACE_NOT_EXTRACTED"
        );
        createSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("FAILED"))
                .body("failureReason", equalTo("PLACE_NOT_EXTRACTED"))
                .body("thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("caption", equalTo("장소가 없는 게시글"))
                .body("author", equalTo("@author"))
                .body("sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("places", hasSize(0));
    }

    @Test
    void 다른_회원의_공유_결과를_조회하면_404_예외를_던진다() {
        // given
        LoginResult owner = loginAsKakao("share-result-owner");
        LoginResult other = loginAsKakao("share-result-other");
        createMedia(jdbcTemplate, 1L, "다른 회원 미디어", "https://img.example.com/media.jpg", "@owner");
        createSharedMedia(jdbcTemplate, 1L, owner.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(other.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(ShareErrorCode.NOT_FOUND.getHttpStatus().value());
    }

    @Test
    void 존재하지_않는_공유_결과를_조회하면_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("share-result-missing-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 99)
                .then().statusCode(ShareErrorCode.NOT_FOUND.getHttpStatus().value());
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
