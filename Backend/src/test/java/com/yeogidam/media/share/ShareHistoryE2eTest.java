package com.yeogidam.media.share;

import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
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

class ShareHistoryE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_히스토리를_조회하면_401이_발생한다() {
        // when & then
        given().when().get(PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 로그인한_회원은_자신의_공유_히스토리만_조회한다() {
        // given
        LoginResult memberA = loginAsKakao("share-list-user-a");
        LoginResult memberB = loginAsKakao("share-list-user-b");
        insertMedia(jdbcTemplate, 201L, "회원 A 게시글", "https://img.example.com/a.jpg", "@member-a");
        insertMedia(jdbcTemplate, 202L, "회원 B 게시글", "https://img.example.com/b.jpg", "@member-b");
        insertSharedMedia(jdbcTemplate, 101L, memberA.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, 102L, memberB.memberId(), 202L, timestamp("2026-09-17 11:00:00"));

        // when
        List<Integer> sharedMediaIds = givenBearer(memberA.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(101);
    }

    @Test
    void 같은_릴스를_다시_공유한_기록은_서로_다른_히스토리로_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-reshares-user");
        insertMedia(jdbcTemplate, 201L, "같은 릴스", "https://img.example.com/media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, 102L, login.memberId(), 201L, timestamp("2026-09-17 11:00:00"));

        // when
        List<Integer> sharedMediaIds = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(102, 101);
    }

    @Test
    void 공유_시각과_공유_ID_내림차순으로_정렬하고_공유_요약_정보를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-summary-user");
        insertMedia(jdbcTemplate, 201L, "성공 게시글", "https://img.example.com/succeeded.jpg", "@succeeded");
        insertMediaWithStatus(202L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        insertSharedMedia(jdbcTemplate, 101L, login.memberId(), 201L, timestamp("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, 102L, login.memberId(), 202L, timestamp("2026-09-17 10:00:00"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(2))
                .body("sharedMedias[0].sharedMediaId", equalTo(102))
                .body("sharedMedias[0].sharedAt", equalTo("2026-09-17T01:00:00Z"))
                .body("sharedMedias[0].thumbnailUrl", equalTo(null))
                .body("sharedMedias[0].caption", equalTo(null))
                .body("sharedMedias[0].author", equalTo(null))
                .body("sharedMedias[0].extractionStatus", equalTo("FAILED"))
                .body("sharedMedias[0].originalUrl", equalTo("https://www.instagram.com/reel/fixture-102/"))
                .body("sharedMedias[1].sharedMediaId", equalTo(101))
                .body("sharedMedias[1].thumbnailUrl", equalTo("https://img.example.com/succeeded.jpg"))
                .body("sharedMedias[1].caption", equalTo("성공 게시글"))
                .body("sharedMedias[1].author", equalTo("@succeeded"))
                .body("sharedMedias[1].extractionStatus", equalTo("SUCCEEDED"))
                .body("sharedMedias[1].originalUrl", equalTo("https://www.instagram.com/reel/fixture-101/"));
    }

    @Test
    void 히스토리가_없으면_빈_목록을_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-empty-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0));
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
