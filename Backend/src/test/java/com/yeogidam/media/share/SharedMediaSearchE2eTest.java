package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.path.json.JsonPath;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class SharedMediaSearchE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/saved-media/search";
    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 검색_결과에_게시글_정보와_모든_추출_장소의_상세_정보를_담는다() {
        // given: 장소 2는 미보관, 장소 3은 다른 회원만 보관하고 장소 1만 내가 보관한다.
        LoginResult login = loginAsKakao("media-search-response");
        LoginResult other = loginAsKakao("media-search-response-other");
        insertResponsePlaces(login.memberId(), other.memberId());
        insertMedia(jdbcTemplate, 1L, "검색 대상\n성수 카페 모음", "search-1.jpg", "@search");
        insertMediaPlace(jdbcTemplate, 30L, 1L, 1L);
        insertMediaPlace(jdbcTemplate, 10L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 20L, 1L, 3L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, BASE);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "성수 카페")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("sharedMedia", hasSize(1))
                .body("sharedMedia[0].sharedMediaId", equalTo(1))
                .body("sharedMedia[0].createdAt", equalTo("2026-11-01T03:00:00.123456Z"))
                .body("sharedMedia[0].caption", equalTo("검색 대상\n성수 카페 모음"))
                .body("sharedMedia[0].thumbnailUrl", equalTo("https://img.example.com/search-1.jpg"))
                .body("sharedMedia[0].author", equalTo("@search"))
                .body("sharedMedia[0].sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("sharedMedia[0].places", hasSize(3))
                .body("sharedMedia[0].places.placeId", contains(2, 3, 1))
                .body("sharedMedia[0].places.savedPlaceId", contains(nullValue(), nullValue(), equalTo(10)))
                .body("sharedMedia[0].places[0].name", equalTo("담다식당"))
                .body("sharedMedia[0].places[0].category", equalTo("음식점 > 한식"))
                .body("sharedMedia[0].places[0].categoryCode", equalTo("KOREAN"))
                .body("sharedMedia[0].places[0].categoryName", equalTo("한식"))
                .body("sharedMedia[0].places[0].landLotAddress", equalTo("서울 성동구 성수동1가 2-2"))
                .body("sharedMedia[0].places[0].roadAddress", nullValue())
                .body("sharedMedia[0].places[0].latitude", equalTo(37.544f))
                .body("sharedMedia[0].places[0].longitude", equalTo(127.05f))
                .body("sharedMedia[0].places[0].kakaoPlaceUrl", equalTo("https://place.map.kakao.com/2"))
                .body("sharedMedia[0].places[0].telephone", equalTo("02-1234-5678"))
                .body("sharedMedia[0].places[0].thumbnailUrl", nullValue())
                .body("sharedMedia[0].places[1].kakaoPlaceUrl", nullValue())
                .body("sharedMedia[0].places[1].telephone", nullValue())
                .body("sharedMedia[0].places[2].name", equalTo("카페 온월"))
                .body("sharedMedia[0].places[2].category", equalTo("음식점 > 카페"))
                .body("sharedMedia[0].places[2].categoryCode", equalTo("CAFE"))
                .body("sharedMedia[0].places[2].categoryName", equalTo("카페"))
                .body("sharedMedia[0].places[2].landLotAddress", equalTo("서울 성동구 성수동1가 1-1"))
                .body("sharedMedia[0].places[2].roadAddress", equalTo("서울 성동구 성수이로 88"))
                .body("sharedMedia[0].places[2].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("sharedMedia[0]", not(hasKey("placeCount")))
                .body("nextCursor", nullValue());
    }

    @Test
    void 검색_결과가_없으면_빈_배열과_null_커서를_반환한다() {
        // given
        LoginResult login = loginAsKakao("media-search-empty");
        insertSearchableMedia(login.memberId(), 1);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "부산")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("sharedMedia", hasSize(0))
                .body("nextCursor", nullValue());
    }

    @Test
    void 검색_결과가_51건이면_50건과_다음_커서를_반환하고_이어_읽으면_마지막_한_건을_반환한다() {
        // given: 보관 장소와의 연결이 없는 51개 게시글을 같은 시각에 공유한다.
        LoginResult login = loginAsKakao("media-search-page");
        insertSearchableMedia(login.memberId(), 51);
        JsonPath firstPage = givenBearer(login.accessToken())
                .queryParam("query", "성수 카페")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("sharedMedia", hasSize(50))
                .body("nextCursor.createdAt", equalTo("2026-11-01T03:00:00.123456Z"))
                .body("nextCursor.id", equalTo(2))
                .extract()
                .jsonPath();

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "성수 카페")
                .queryParam("cursorCreatedAt", firstPage.getString("nextCursor.createdAt"))
                .queryParam("cursorId", firstPage.getLong("nextCursor.id"))
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("sharedMedia.sharedMediaId", contains(1))
                .body("nextCursor", nullValue());
    }

    @Test
    void 토큰_없이_게시글을_검색하면_401_예외를_던진다() {
        // when & then
        given()
                .queryParam("query", "성수 카페")
                .when()
                .get(PATH)
                .then()
                .statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()))
                .body("message", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getMessage()));
    }

    @Test
    void 커서_ID만_보내면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("media-search-incomplete-cursor");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "성수 카페")
                .queryParam("cursorId", 2L)
                .when()
                .get(PATH)
                .then()
                .statusCode(MediaErrorCode.INCOMPLETE_CURSOR.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getCode()))
                .body("message", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getMessage()));
    }

    @Test
    void 검색어를_보내지_않으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("media-search-missing-query");

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(PATH)
                .then()
                .statusCode(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getCode()))
                .body("message", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getMessage()));
    }

    @Test
    void 검색어가_앞뒤_공백을_제외하고_100자를_초과하면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("media-search-long-query");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "  " + "가".repeat(101) + "  ")
                .when()
                .get(PATH)
                .then()
                .statusCode(CommonErrorCode.ILLEGAL_ARGUMENT.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.ILLEGAL_ARGUMENT.getCode()))
                .body("message", equalTo(CommonErrorCode.ILLEGAL_ARGUMENT.getMessage()));
    }

    private void insertResponsePlaces(Long memberId, Long otherMemberId) {
        insertPlace(jdbcTemplate, 1L, "kakao-search-response-1", "카페 온월", "음식점 > 카페",
                "서울 성동구 성수동1가 1-1", "서울 성동구 성수이로 88", new BigDecimal("37.5445"),
                new BigDecimal("127.0560"), null, null, "place-1.jpg", "KAKAO");
        insertPlace(jdbcTemplate, 2L, "kakao-search-response-2", "담다식당", "음식점 > 한식",
                "서울 성동구 성수동1가 2-2", null, new BigDecimal("37.5440"),
                new BigDecimal("127.0500"), "https://place.map.kakao.com/2", "02-1234-5678", null, null);
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 3L, "kakao-search-response-3", "다른 회원만 보관한 장소",
                "서울 성동구 성수동1가 3-3", new BigDecimal("37.5450"), new BigDecimal("127.0510"));
        insertSavedPlace(jdbcTemplate, 10L, memberId, 1L, BASE);
        insertSavedPlace(jdbcTemplate, 30L, otherMemberId, 3L, BASE);
    }

    private void insertSearchableMedia(Long memberId, int count) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-search-page", "카페", "서울 성동구",
                new BigDecimal("37.5445"), new BigDecimal("127.0560"));
        for (long id = 1; id <= count; id++) {
            insertMedia(jdbcTemplate, id, "성수 카페 모음 " + id, null, null);
            insertMediaPlace(jdbcTemplate, id, id, 1L);
            insertSharedMedia(jdbcTemplate, id, memberId, id, BASE);
        }
    }
}
