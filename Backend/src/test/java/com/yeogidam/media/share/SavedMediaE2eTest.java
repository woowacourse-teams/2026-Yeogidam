package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.path.json.JsonPath;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class SavedMediaE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/saved-media";
    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        // when & then
        given().when().get(PATH)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 보관함_게시물을_게시물에서_나온_장소와_함께_돌려준다() {
        // given: 게시물 1에서 담다식당, 카페 온월 순서로 장소가 나왔고, 회원은 담다식당을 보관함에서 지웠다
        LoginResult login = loginAsKakao("saved-media-response-user");
        insertMedia(jdbcTemplate, 1L, "성수 감성 카페 모음", "media.jpg", "@seongsu_cafe");
        insertPlace(jdbcTemplate, 1L, "kakao-saved-media-1", "카페 온월", "음식점 > 카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", new BigDecimal("37.5446"),
                new BigDecimal("127.0559"), "https://place.map.kakao.com/1", null, "place-1.jpg", "KAKAO");
        insertPlace(jdbcTemplate, 2L, "kakao-saved-media-2", "담다식당", "음식점 > 한식",
                "서울 성동구 성수동1가 2-2", null, new BigDecimal("37.5440"),
                new BigDecimal("127.0500"), "https://place.map.kakao.com/2", null, null, null);
        insertMediaPlace(jdbcTemplate, 1L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 2L, 1L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].sharedMediaId", equalTo(1))
                .body("sharedMedias[0].createdAt", equalTo("2026-11-01T03:00:00.123456Z"))
                .body("sharedMedias[0].thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("sharedMedias[0].caption", equalTo("성수 감성 카페 모음"))
                .body("sharedMedias[0].author", equalTo("@seongsu_cafe"))
                .body("sharedMedias[0].sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("sharedMedias[0].places", hasSize(2))
                .body("sharedMedias[0].places[0].savedPlaceId", nullValue())
                .body("sharedMedias[0].places[0].placeId", equalTo(2))
                .body("sharedMedias[0].places[0].name", equalTo("담다식당"))
                .body("sharedMedias[0].places[0].categoryCode", equalTo("KOREAN"))
                .body("sharedMedias[0].places[0].roadAddress", nullValue())
                .body("sharedMedias[0].places[0].thumbnailUrl", nullValue())
                .body("sharedMedias[0].places[1].savedPlaceId", equalTo(10))
                .body("sharedMedias[0].places[1].placeId", equalTo(1))
                .body("sharedMedias[0].places[1].name", equalTo("카페 온월"))
                .body("sharedMedias[0].places[1].category", equalTo("음식점 > 카페"))
                .body("sharedMedias[0].places[1].categoryCode", equalTo("CAFE"))
                .body("sharedMedias[0].places[1].categoryName", equalTo("카페"))
                .body("sharedMedias[0].places[1].landLotAddress", equalTo("서울 성동구 성수동2가 1-1"))
                .body("sharedMedias[0].places[1].roadAddress", equalTo("서울 성동구 연무장길 1"))
                .body("sharedMedias[0].places[1].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("nextCursor", nullValue());
    }

    @Test
    void 보관함_게시물이_없으면_빈_목록을_돌려준다() {
        // given
        LoginResult login = loginAsKakao("saved-media-empty-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0))
                .body("nextCursor", nullValue());
    }

    @Test
    void 받은_커서로_다음_페이지를_조회하면_남은_게시물을_돌려주고_다음_커서는_null이다() {
        // given: 게시물 55개를 1초 간격으로 한 번씩 공유했고, 모두 보관함 장소와 연결되어 있다
        LoginResult login = loginAsKakao("saved-media-page-user");
        insertSavedMediaOneSecondApart(login.memberId(), 55);
        JsonPath firstPage = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(50))
                .body("nextCursor.createdAt", equalTo("2026-11-01T03:00:06.123456Z"))
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

    @ParameterizedTest
    @CsvSource(value = {"2026-11-01T03:00:06.123456Z, NULL", "NULL, 6"}, nullValues = "NULL")
    void 커서의_공유_시각과_ID_중_하나만_보내면_400_예외를_던진다(String cursorCreatedAt, Long cursorId) {
        // given
        LoginResult login = loginAsKakao("saved-media-incomplete-cursor-user");

        // when & then
        var request = givenBearer(login.accessToken());
        if (cursorCreatedAt != null) {
            request.queryParam("cursorCreatedAt", cursorCreatedAt);
        }
        if (cursorId != null) {
            request.queryParam("cursorId", cursorId);
        }
        request.when().get(PATH)
                .then().statusCode(MediaErrorCode.INCOMPLETE_CURSOR.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getCode()))
                .body("message", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getMessage()));
    }

    /**
     * 게시물 1부터 count까지 1초 간격으로 한 번씩 공유하고, 모든 공유를 같은 보관함 장소와 연결한다. ID가 클수록 최근 공유다.
     */
    private void insertSavedMediaOneSecondApart(Long memberId, int count) {
        insertPlace(jdbcTemplate, 1L, "kakao-saved-media-page", "성수 카페", "음식점 > 카페",
                "서울 성동구 성수동2가 1-1", null, new BigDecimal("37.5446"),
                new BigDecimal("127.0559"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 1L, memberId, 1L, BASE);
        for (long id = 1; id <= count; id++) {
            Instant createdAt = BASE.plusSeconds(id);
            insertMedia(jdbcTemplate, id, "페이지 게시물 " + id, "page-" + id + ".jpg", "@page");
            insertMediaPlace(jdbcTemplate, id, id, 1L);
            insertSharedMedia(jdbcTemplate, id, memberId, id, createdAt);
            insertSavedPlaceShare(jdbcTemplate, id, 1L, id, createdAt);
        }
    }
}
