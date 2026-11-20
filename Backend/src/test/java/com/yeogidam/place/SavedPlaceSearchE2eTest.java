package com.yeogidam.place;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.search.exception.SearchErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class SavedPlaceSearchE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/saved-places/search";
    private static final Instant SAVED_AT = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 장소명_검색_시_검색어를_포함한_내_장소를_모두_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-search-response");
        insertPlace(jdbcTemplate, 1L, "kakao-onion-seongsu", "카페 어니언 성수", "음식점 > 카페",
                "서울 성동구 성수동2가 277-135", "서울 성동구 아차산로9길 8", new BigDecimal("37.5445"),
                new BigDecimal("127.0560"), "https://place.map.kakao.com/1", "02-1111-2222", "onion.jpg", "KAKAO");
        insertPlace(jdbcTemplate, 2L, "kakao-onion-anguk", "어니언 안국", "음식점 > 카페",
                "서울 종로구 계동 146-1", "서울 종로구 계동길 5", new BigDecimal("37.5770"),
                new BigDecimal("126.9860"), null, null, null, null);
        insertPlace(jdbcTemplate, 3L, "kakao-another-place", "다른 가게", "음식점 > 한식",
                "서울 성동구 성수동1가 3-3", null, new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT.plusSeconds(1));
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 13L, login.memberId(), 3L, SAVED_AT);
        insertFolder(jdbcTemplate, 7L, login.memberId(), "가고 싶은 곳", "RED", SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 1L, 7L, 11L, SAVED_AT);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "어니언")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces.name", containsInAnyOrder("카페 어니언 성수", "어니언 안국"))
                .body("savedPlaces[0].savedPlaceId", equalTo(11))
                .body("savedPlaces[0].placeId", equalTo(1))
                .body("savedPlaces[0].category", equalTo("음식점 > 카페"))
                .body("savedPlaces[0].categoryCode", equalTo("CAFE"))
                .body("savedPlaces[0].categoryName", equalTo("카페"))
                .body("savedPlaces[0].landLotAddress", equalTo("서울 성동구 성수동2가 277-135"))
                .body("savedPlaces[0].roadAddress", equalTo("서울 성동구 아차산로9길 8"))
                .body("savedPlaces[0].latitude", equalTo(37.5445f))
                .body("savedPlaces[0].longitude", equalTo(127.0560f))
                .body("savedPlaces[0].kakaoPlaceUrl", equalTo("https://place.map.kakao.com/1"))
                .body("savedPlaces[0].telephone", equalTo("02-1111-2222"))
                .body("savedPlaces[0].thumbnailUrl", equalTo("https://img.example.com/onion.jpg"))
                .body("savedPlaces[0].thumbnailSource", equalTo("KAKAO"))
                .body("savedPlaces[0].lastSavedAt", equalTo("2026-11-01T03:00:01.123456Z"))
                .body("savedPlaces[0].folderIds", contains(7))
                .body("savedPlaces[1].folderIds", hasSize(0));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', nullValues = "NULL", value = {
            "음식점 > 간식 > 제과,베이커리 | 디저트 | DESSERT | 디저트",
            "가정,생활 > 생활용품점 | 여가 | CULTURE_LEISURE | 문화/여가",
            "NULL | 기타 | ETC | 기타"
    })
    void 카테고리_원문에_없어도_화면의_카테고리_이름에_검색어가_포함되면_반환한다(
            String category,
            String query,
            String categoryCode,
            String categoryName
    ) {
        // given
        LoginResult login = loginAsKakao("place-search-category-name");
        insertPlace(jdbcTemplate, 1L, "kakao-category-name", "첫 번째 가게", category,
                "서울 성동구 성수동2가 1-1", "서울 성동구 아차산로 1", new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertPlace(jdbcTemplate, 2L, "kakao-other-category", "두 번째 가게", "음식점 > 카페",
                "서울 성동구 성수동2가 2-2", "서울 성동구 아차산로 2", new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, SAVED_AT);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", query)
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces.savedPlaceId", contains(11))
                .body("savedPlaces[0].category", equalTo(category))
                .body("savedPlaces[0].categoryCode", equalTo(categoryCode))
                .body("savedPlaces[0].categoryName", equalTo(categoryName));
    }

    @Test
    void 카테고리_원문이나_장소명에_검색어가_포함되면_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-search-category-original");
        insertPlace(jdbcTemplate, 1L, "kakao-category-original", "첫 번째 가게", "음식점 > 간식 > 제과,베이커리",
                "서울 성동구 성수동2가 1-1", "서울 성동구 아차산로 1", new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertPlace(jdbcTemplate, 2L, "kakao-category-word-in-name", "간식 상점", "음식점 > 한식",
                "서울 성동구 성수동2가 2-2", "서울 성동구 아차산로 2", new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, SAVED_AT);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "간식")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces.savedPlaceId", containsInAnyOrder(11, 12));
    }

    @ParameterizedTest
    @ValueSource(strings = {"잠실 디저트", "잠실 간식"})
    void 주소와_카테고리를_함께_검색하면_둘_다_일치하는_내_장소를_반환한다(String query) {
        // given
        LoginResult login = loginAsKakao("place-search-multiple-words");
        LoginResult other = loginAsKakao("place-search-multiple-words-other");
        insertPlace(jdbcTemplate, 1L, "kakao-search-lake", "레이크", "음식점 > 간식",
                "서울 송파구 잠실동 1-1", "서울 송파구 올림픽로 1", new BigDecimal("37.51"),
                new BigDecimal("127.08"), null, null, null, null);
        insertPlace(jdbcTemplate, 2L, "kakao-search-onwol", "온월", "음식점 > 간식",
                "서울 송파구 신천동 2-2", "서울 송파구 잠실로 2", new BigDecimal("37.52"),
                new BigDecimal("127.09"), null, null, null, null);
        insertPlace(jdbcTemplate, 3L, "kakao-search-restaurant", "소문난집", "음식점 > 한식",
                "서울 송파구 잠실동 3-3", "서울 송파구 올림픽로 3", new BigDecimal("37.51"),
                new BigDecimal("127.08"), null, null, null, null);
        insertPlace(jdbcTemplate, 4L, "kakao-search-another-area", "어니언", "음식점 > 간식",
                "서울 성동구 성수동2가 4-4", "서울 성동구 아차산로 4", new BigDecimal("37.54"),
                new BigDecimal("127.05"), null, null, null, null);
        insertPlace(jdbcTemplate, 5L, "kakao-search-other-member", "다른 회원의 가게", "음식점 > 간식",
                "서울 송파구 잠실동 5-5", "서울 송파구 올림픽로 5", new BigDecimal("37.51"),
                new BigDecimal("127.08"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 13L, login.memberId(), 3L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 14L, login.memberId(), 4L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 21L, other.memberId(), 5L, SAVED_AT);

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", query)
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces.savedPlaceId", containsInAnyOrder(11, 12))
                .body("savedPlaces.name", containsInAnyOrder("레이크", "온월"));
    }

    @Test
    void 검색어와_일치하는_내_장소가_없으면_빈_목록을_반환한다() {
        // given: 보관함에는 강남 장소만 있다.
        LoginResult login = loginAsKakao("place-search-no-match");
        insertPlace(jdbcTemplate, 1L, "kakao-gangnam-only", "강남의 가게", "음식점 > 한식",
                "서울 강남구 역삼동 1-1", "서울 강남구 테헤란로 1", new BigDecimal("37.50"),
                new BigDecimal("127.03"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);

        // when
        Map<String, Object> response = givenBearer(login.accessToken())
                .queryParam("query", "잠실")
                .when()
                .get(PATH)
                .then()
                .statusCode(200)
                .extract()
                .jsonPath()
                .getMap("");

        // then
        assertThat(response)
                .isEqualTo(Map.of("savedPlaces", List.of()));
    }

    @Test
    void 검색어를_보내지_않으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-search-missing-query");
        CommonErrorCode errorCode = CommonErrorCode.MISSING_REQUEST_PARAMETER;

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(PATH)
                .then()
                .statusCode(errorCode.getHttpStatus().value())
                .body("errorCode", equalTo(errorCode.getCode()))
                .body("message", equalTo(errorCode.getMessage()));
    }

    @Test
    void 검색어가_공백뿐이면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-search-blank-query");
        SearchErrorCode errorCode = SearchErrorCode.INVALID_SEARCH_QUERY;

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "   ")
                .when()
                .get(PATH)
                .then()
                .statusCode(errorCode.getHttpStatus().value())
                .body("errorCode", equalTo(errorCode.getCode()))
                .body("message", equalTo(errorCode.getMessage()));
    }

    @Test
    void 검색어가_101자이면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-search-long-query");
        SearchErrorCode errorCode = SearchErrorCode.INVALID_SEARCH_QUERY;

        // when & then
        givenBearer(login.accessToken())
                .queryParam("query", "가".repeat(101))
                .when()
                .get(PATH)
                .then()
                .statusCode(errorCode.getHttpStatus().value())
                .body("errorCode", equalTo(errorCode.getCode()))
                .body("message", equalTo(errorCode.getMessage()));
    }

    @Test
    void 토큰_없이_장소를_검색하면_401_예외를_던진다() {
        // when & then
        given()
                .queryParam("query", "어니언")
                .when()
                .get(PATH)
                .then()
                .statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()))
                .body("message", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getMessage()));
    }
}
