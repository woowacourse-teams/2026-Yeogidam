package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.Instant;
import io.restassured.path.json.JsonPath;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ShareHistoryE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares";
    private static final Instant BASE = Instant.parse("2026-09-20T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_히스토리를_조회하면_401_예외를_던진다() {
        // when & then
        given().when().get(PATH)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 로그인한_회원은_자신의_공유_히스토리만_조회한다() {
        // given
        LoginResult memberA = loginAsKakao("share-list-user-a");
        LoginResult memberB = loginAsKakao("share-list-user-b");
        insertMedia(jdbcTemplate, 1L, "회원 A 게시글", "a.jpg", "@member-a");
        insertMedia(jdbcTemplate, 2L, "회원 B 게시글", "b.jpg", "@member-b");
        insertSharedMedia(jdbcTemplate, 1L, memberA.memberId(), 1L, Instant.parse("2026-09-17T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 2L, memberB.memberId(), 2L, Instant.parse("2026-09-17T11:00:00Z"));

        // when
        List<Integer> sharedMediaIds = givenBearer(memberA.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(1);
    }

    @Test
    void 같은_릴스를_다시_공유한_기록은_서로_다른_히스토리로_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-reshares-user");
        insertMedia(jdbcTemplate, 1L, "같은 릴스", "media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, Instant.parse("2026-09-17T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 1L, Instant.parse("2026-09-17T11:00:00Z"));

        // when
        List<Integer> sharedMediaIds = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath().getList("sharedMedias.sharedMediaId", Integer.class);

        // then
        assertThat(sharedMediaIds).containsExactly(2, 1);
    }

    @Test
    void 공유_시각과_공유_ID_내림차순으로_정렬하고_공유_요약_정보를_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-summary-user");
        insertMedia(jdbcTemplate, 1L, "성공 게시글", "succeeded.jpg", "@succeeded");
        insertMediaWithStatus(2L, null, null, null, "FAILED", "CONTENT_UNAVAILABLE");
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, Instant.parse("2026-09-17T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 2L, Instant.parse("2026-09-17T10:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(2))
                .body("sharedMedias[0].sharedMediaId", equalTo(2))
                .body("sharedMedias[0].createdAt", equalTo("2026-09-17T10:00:00Z"))
                .body("sharedMedias[0].thumbnailUrl", equalTo(null))
                .body("sharedMedias[0].caption", equalTo(null))
                .body("sharedMedias[0].author", equalTo(null))
                .body("sharedMedias[0].extractionStatus", equalTo("FAILED"))
                .body("sharedMedias[0].failureReason", equalTo("CONTENT_UNAVAILABLE"))
                .body("sharedMedias[0].sharedUrl", equalTo("https://www.instagram.com/reel/fixture-2/"))
                .body("sharedMedias[1].sharedMediaId", equalTo(1))
                .body("sharedMedias[1].thumbnailUrl", equalTo("https://img.example.com/succeeded.jpg"))
                .body("sharedMedias[1].caption", equalTo("성공 게시글"))
                .body("sharedMedias[1].author", equalTo("@succeeded"))
                .body("sharedMedias[1].extractionStatus", equalTo("SUCCEEDED"))
                .body("sharedMedias[1].failureReason", equalTo(null))
                .body("sharedMedias[1].sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"));
    }

    @Test
    void 히스토리가_없으면_빈_목록을_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-list-empty-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0))
                .body("nextCursor", nullValue());
    }

    @Test
    void 공유가_50건을_넘으면_최신_50건과_다음_커서를_돌려준다() {
        // given: 1초 간격으로 공유한 기록이 55건 있다
        LoginResult login = loginAsKakao("share-page-first-user");
        insertSharesOneSecondApart(login.memberId(), 55);

        // when & then: 50번째 공유(6)가 커서가 되고, 시각은 마이크로초까지 그대로 내려온다
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(50))
                .body("sharedMedias[0].sharedMediaId", equalTo(55))
                .body("sharedMedias[49].sharedMediaId", equalTo(6))
                .body("nextCursor.createdAt", equalTo("2026-09-20T03:00:06.123456Z"))
                .body("nextCursor.id", equalTo(6));
    }

    @Test
    void 커서로_다음_페이지를_조회하면_남은_공유를_반환하고_다음_커서는_null이다() {
        // given
        LoginResult login = loginAsKakao("share-page-next-user");
        insertSharesOneSecondApart(login.memberId(), 55);
        JsonPath firstPage = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("nextCursor.createdAt", equalTo("2026-09-20T03:00:06.123456Z"))
                .body("nextCursor.id", equalTo(6))
                .extract().jsonPath();

        // when & then
        givenBearer(login.accessToken())
                .queryParam("cursorCreatedAt", firstPage.getString("nextCursor.createdAt"))
                .queryParam("cursorId", firstPage.getLong("nextCursor.id"))
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(5, 4, 3, 2, 1))
                .body("nextCursor", nullValue());
    }

    @Test
    void 첫_페이지를_읽은_뒤_맨_위에_새_공유가_끼어들어도_받은_커서로_조회한_다음_페이지는_달라지지_않는다() {
        // given: 첫 페이지(55~6)를 읽은 뒤 새 공유 56이 생긴다
        LoginResult login = loginAsKakao("share-page-new-share-user");
        insertSharesOneSecondApart(login.memberId(), 55);
        JsonPath firstPage = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .extract().jsonPath();
        insertSharedMedia(jdbcTemplate, 56L, login.memberId(), 1L, BASE.plusSeconds(56));

        // when & then
        givenBearer(login.accessToken())
                .queryParam("cursorCreatedAt", firstPage.getString("nextCursor.createdAt"))
                .queryParam("cursorId", firstPage.getLong("nextCursor.id"))
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(5, 4, 3, 2, 1));
    }

    @ParameterizedTest
    @CsvSource(value = {"2026-09-20T03:00:06.123456Z, NULL", "NULL, 6"}, nullValues = "NULL")
    void 커서의_공유_시각과_ID_중_하나만_보내면_400_예외를_던진다(String cursorCreatedAt, Long cursorId) {
        // given
        LoginResult login = loginAsKakao("share-page-incomplete-cursor-user");

        // when & then
        var request = givenBearer(login.accessToken());
        if (cursorCreatedAt != null) {
            request.queryParam("cursorCreatedAt", cursorCreatedAt);
        }
        if (cursorId != null) {
            request.queryParam("cursorId", cursorId);
        }
        request.when().get(PATH)
                .then().statusCode(MediaErrorCode.INCOMPLETE_HISTORY_CURSOR.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.INCOMPLETE_HISTORY_CURSOR.getCode()))
                .body("message", equalTo(MediaErrorCode.INCOMPLETE_HISTORY_CURSOR.getMessage()));
    }

    @ParameterizedTest
    @CsvSource({"2026-09-20, 6", "2026-09-20T03:00:06Z, abc"})
    void 커서_형식이_맞지_않으면_400_예외를_던진다(String cursorCreatedAt, String cursorId) {
        // given
        LoginResult login = loginAsKakao("share-page-invalid-cursor-user");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("cursorCreatedAt", cursorCreatedAt)
                .queryParam("cursorId", cursorId)
                .when().get(PATH)
                .then().statusCode(CommonErrorCode.REQUEST_VALUE_TYPE_MISMATCH.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.REQUEST_VALUE_TYPE_MISMATCH.getCode()));
    }

    @Test
    void 히스토리_내_장소_목록을_후보_ID_오름차순으로_반환한다() {
        // given
        LoginResult login = loginAsKakao("share-history-places-user");
        insertMedia(jdbcTemplate, 1L, "장소 모음", "media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, Instant.parse("2026-09-17T10:00:00Z"));
        insertPlace(jdbcTemplate, 1L, "kakao-fixture-1", "첫 번째 카페", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", new BigDecimal("37.5446"),
                new BigDecimal("127.0559"), "https://place.map.kakao.com/1", null,
                "https://img.example.com/place-1.jpg", null);
        insertPlace(jdbcTemplate, 2L, "kakao-fixture-2", "두 번째 식당", "식당",
                "서울 종로구 관철동 1-1", "서울 종로구 삼일대로 1", new BigDecimal("37.5704"),
                new BigDecimal("126.9921"), "https://place.map.kakao.com/2", null,
                "https://img.example.com/place-2.jpg", null);
        insertUndecidedCandidate(jdbcTemplate, 2L, 1L, 2L);
        insertUndecidedCandidate(jdbcTemplate, 1L, 1L, 1L);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + "/1/places")
                .then().statusCode(200)
                .body("places", hasSize(2))
                .body("places[0].placeId", equalTo(1))
                .body("places[0].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("places[0].name", equalTo("첫 번째 카페"))
                .body("places[0].category", equalTo("카페"))
                .body("places[0].landLotAddress", equalTo("서울 성동구 성수동2가 1-1"))
                .body("places[0].roadAddress", equalTo("서울 성동구 연무장길 1"))
                .body("places[1].placeId", equalTo(2))
                .body("places[1].name", equalTo("두 번째 식당"));
    }

    @Test
    void 토큰_없이_히스토리_내_장소_목록을_조회하면_401_예외를_던진다() {
        // when & then
        given().when().get(PATH + "/1/places")
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 다른_회원의_히스토리_내_장소_목록을_조회하면_404_예외를_던진다() {
        // given
        LoginResult owner = loginAsKakao("share-history-places-owner");
        LoginResult other = loginAsKakao("share-history-places-other");
        insertMedia(jdbcTemplate, 1L, "게시글", "media.jpg", "@owner");
        insertSharedMedia(jdbcTemplate, 1L, owner.memberId(), 1L, Instant.parse("2026-09-17T10:00:00Z"));

        // when & then
        givenBearer(other.accessToken())
                .when().get(PATH + "/1/places")
                .then().statusCode(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getCode()))
                .body("message", equalTo(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getMessage()));
    }

    @Test
    void 존재하지_않는_히스토리의_장소_목록을_조회하면_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("share-history-places-missing-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH + "/99/places")
                .then().statusCode(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getCode()))
                .body("message", equalTo(MediaErrorCode.SHARED_MEDIA_NOT_FOUND.getMessage()));
    }

    /**
     * 게시물 하나를 1초 간격으로 count번 공유한 기록을 넣는다. ID가 클수록 최근 공유다.
     */
    private void insertSharesOneSecondApart(Long memberId, int count) {
        insertMedia(jdbcTemplate, 1L, "페이지 게시글", "page.jpg", "@page");
        IntStream.rangeClosed(1, count)
                .forEach(id -> insertSharedMedia(jdbcTemplate, (long) id, memberId, 1L, BASE.plusSeconds(id)));
    }

    private void insertMediaWithStatus(
            Long mediaId,
            String caption,
            String thumbnailKey,
            String author,
            String extractionStatus,
            String failureReason
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_key, author,
                    extraction_status, failure_reason, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailKey, author,
                extractionStatus, failureReason);
    }
}
