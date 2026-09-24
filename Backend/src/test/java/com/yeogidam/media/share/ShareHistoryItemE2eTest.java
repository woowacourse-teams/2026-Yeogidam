package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;

import com.yeogidam.media.share.exception.ShareErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareHistoryItemE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares/";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 분석_중인_공유를_조회하면_200_응답한다() {
        // given
        LoginResult login = loginAsKakao("share-result-extracting-user");
        insertMediaWithStatus(1L, null, null, null, "EXTRACTING", null);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

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
                .body("$", not(hasKey("places")));
    }

    @Test
    void 장소를_추출하지_못한_공유를_조회하면_200_응답한다() {
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
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(200)
                .body("extractionStatus", equalTo("FAILED"))
                .body("failureReason", equalTo("PLACE_NOT_EXTRACTED"))
                .body("thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("caption", equalTo("장소가 없는 게시글"))
                .body("author", equalTo("@author"))
                .body("sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"));
    }

    @Test
    void 다른_회원의_히스토리_항목을_조회하면_404_예외를_던진다() {
        // given
        LoginResult owner = loginAsKakao("share-result-owner");
        LoginResult other = loginAsKakao("share-result-other");
        insertMedia(jdbcTemplate, 1L, "다른 회원 미디어", "https://img.example.com/media.jpg", "@owner");
        insertSharedMedia(jdbcTemplate, 1L, owner.memberId(), 1L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(other.accessToken())
                .when().get(PATH + 1)
                .then().statusCode(ShareErrorCode.NOT_FOUND.getHttpStatus().value());
    }

    @Test
    void 존재하지_않는_히스토리_항목을_조회하면_404_예외를_던진다() {
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
