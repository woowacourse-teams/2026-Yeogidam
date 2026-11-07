package com.yeogidam.place;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

class PlaceInfoE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/places/{placeId}/info";
    private static final long PLACE_ID = 1L;
    private static final long MEDIA_ID = 21L;
    private static final long SHARED_MEDIA_ID = 31L;
    private static final Instant SHARED_AT = Instant.parse("2026-11-07T00:00:00Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 보관함에_없어도_내_공유_게시물에서_추출된_장소의_영업시간과_메뉴를_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-info-user");
        insertCafePost();
        insertSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, login.memberId(), MEDIA_ID, SHARED_AT);
        updatePlaceInfo("""
                [
                  {
                    "dayOfWeek": "MONDAY",
                    "periods": [
                      { "opensAt": "11:00", "closesAt": "15:00" },
                      { "opensAt": "17:00", "closesAt": "21:00" }
                    ]
                  },
                  { "dayOfWeek": "SUNDAY", "periods": [] }
                ]
                """, """
                [
                  { "name": "아메리카노", "price": 4500 },
                  { "name": "오늘의 디저트", "price": null }
                ]
                """);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(HttpStatus.OK.value())
                .body("keySet()", containsInAnyOrder("openingHours", "menus"))
                .body("openingHours.dayOfWeek", contains("MONDAY", "SUNDAY"))
                .body("openingHours[0].periods.opensAt", contains("11:00", "17:00"))
                .body("openingHours[0].periods.closesAt", contains("15:00", "21:00"))
                .body("openingHours[1].periods", empty())
                .body("menus.name", contains("아메리카노", "오늘의 디저트"))
                .body("menus[0].price", equalTo(4500))
                .body("menus[1]", hasKey("price"))
                .body("menus[1].price", nullValue());
    }

    @Test
    void 상세_정보가_없는_장소는_영업시간_null과_빈_메뉴_목록을_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-info-empty-user");
        insertCafe();
        insertSavedPlace(jdbcTemplate, 1L, login.memberId(), PLACE_ID, SHARED_AT);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(HttpStatus.OK.value())
                .body("keySet()", containsInAnyOrder("openingHours", "menus"))
                .body("openingHours", nullValue())
                .body("menus", empty());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[{\"dayOfWeek\":\"MONDAY\"}]",
            "[{\"dayOfWeek\":\"MONDAY\",\"periods\":[{\"opensAt\":\"9:00\",\"closesAt\":\"21:00\"}]}]",
            "[null]"
    })
    void 형식이_잘못된_영업시간은_null로_돌려주고_메뉴는_반환한다(String openingHours) {
        // given
        LoginResult login = loginAsKakao("place-info-invalid-hours-user");
        insertCafe();
        insertSavedPlace(jdbcTemplate, 1L, login.memberId(), PLACE_ID, SHARED_AT);
        updatePlaceInfo(openingHours, """
                [{"name":"아메리카노","price":4500}]
                """);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(HttpStatus.OK.value())
                .body("openingHours", nullValue())
                .body("menus.name", contains("아메리카노"));
    }

    @Test
    void 형식이_잘못된_메뉴는_빈_목록으로_돌려주고_영업시간은_반환한다() {
        // given
        LoginResult login = loginAsKakao("place-info-invalid-menus-user");
        insertCafe();
        insertSavedPlace(jdbcTemplate, 1L, login.memberId(), PLACE_ID, SHARED_AT);
        updatePlaceInfo("""
                [{"dayOfWeek":"SUNDAY","periods":[]}]
                """, "{}");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(HttpStatus.OK.value())
                .body("openingHours.dayOfWeek", contains("SUNDAY"))
                .body("openingHours[0].periods", empty())
                .body("menus", empty());
    }

    @Test
    void 존재하지_않는_장소를_조회하면_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-info-missing-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceErrorCode.PLACE_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getCode()))
                .body("message", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getMessage()));
    }

    @Test
    void 다른_회원의_보관함과_공유에만_있는_장소를_조회하면_404_예외를_던진다() {
        // given
        LoginResult requester = loginAsKakao("place-info-requester");
        LoginResult owner = loginAsKakao("place-info-owner");
        insertCafePost();
        insertSavedPlace(jdbcTemplate, 1L, owner.memberId(), PLACE_ID, SHARED_AT);
        insertSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, owner.memberId(), MEDIA_ID, SHARED_AT);

        // when & then
        givenBearer(requester.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceErrorCode.PLACE_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getCode()));
    }

    @Test
    void 내_삭제된_공유에만_있는_장소를_조회하면_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-info-deleted-user");
        insertCafePost();
        insertDeletedSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, login.memberId(), MEDIA_ID, SHARED_AT, SHARED_AT);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceErrorCode.PLACE_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getCode()));
    }

    @Test
    void 내_분석_실패_공유에만_있는_장소를_조회하면_404_예외를_던진다() {
        // given: 게시물에는 장소가 추출됐지만, 요청한 회원의 공유는 분석 실패로 남아 있다.
        LoginResult login = loginAsKakao("place-info-failed-user");
        insertCafePost();
        insertSharedMedia(jdbcTemplate, SHARED_MEDIA_ID, login.memberId(), MEDIA_ID, SHARED_AT,
                new ExtractionSnapshot(ExtractionStatus.FAILED, ExtractionFailureReason.PLACE_NOT_EXTRACTED,
                        1, MediaSourceType.EXTRACTED));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceErrorCode.PLACE_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getCode()));
    }

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        // when & then
        given()
                .when().get(PATH, PLACE_ID)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    private void insertCafePost() {
        insertCafe();
        insertMedia(jdbcTemplate, MEDIA_ID, "성수 카페 투어", "cafe.jpg", "@seongsu");
        insertMediaPlace(jdbcTemplate, 1L, MEDIA_ID, PLACE_ID);
    }

    private void insertCafe() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, PLACE_ID, "place-info-cafe", "카페 온월",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
    }

    private void updatePlaceInfo(String openingHours, String menus) {
        jdbcTemplate.update("""
                UPDATE places
                SET opening_hours = ?, menus = ?
                WHERE id = ?
                """, openingHours, menus, PLACE_ID);
    }
}
