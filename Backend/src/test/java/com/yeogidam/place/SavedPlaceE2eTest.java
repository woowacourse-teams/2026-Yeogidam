package com.yeogidam.place;

import static com.yeogidam.support.SavedPlaceSqlFixture.INSERT_MEMBERS_SQL;
import static com.yeogidam.support.SavedPlaceSqlFixture.INSERT_PLACES_SQL;
import static com.yeogidam.support.SavedPlaceSqlFixture.INSERT_SAVED_PLACES_SQL;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.jdbc.Sql;

/**
 * 보관함 목록 조회를 실제 HTTP로 검증한다. 정렬과 열 매핑의 세부는 SavedPlaceDaoTest가 맡고, 여기서는 응답 모양(감싸는 키, 필드 이름, 계산값, null)과 인가가 응답으로 드러나는지만
 * 본다.
 */
class SavedPlaceE2eTest extends E2eTestSupport {

    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";

    @Test
    @Sql(statements = {INSERT_MEMBERS_SQL, INSERT_PLACES_SQL, INSERT_SAVED_PLACES_SQL})
    void 로그인한_회원은_보관함_목록을_최근_저장_순으로_조회한다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(3))
                .body("savedPlaces.placeId", contains(3, 2, 1))
                .body("savedPlaces[0].name", equalTo("경복궁"))
                .body("savedPlaces[0].category", equalTo("관광명소"))
                .body("savedPlaces[0].landLotAddress", equalTo("서울 종로구 세종로 1-1"))
                .body("savedPlaces[0].roadAddress", equalTo("서울 종로구 사직로 161"))
                .body("savedPlaces[0].summaryAddress", equalTo("서울 종로구"))
                .body("savedPlaces[0].latitude", equalTo(37.5796f))
                .body("savedPlaces[0].longitude", equalTo(126.9770f))
                .body("savedPlaces[0].kakaoPlaceUrl", equalTo("https://place.map.kakao.com/3"))
                .body("savedPlaces[0].telephone", nullValue())
                .body("savedPlaces[0].thumbnailUrl", equalTo("https://img.example.com/3.jpg"))
                .body("savedPlaces[0].thumbnailSource", equalTo("KAKAO"))
                .body("savedPlaces[0].thumbnailAttribution", nullValue())
                .body("savedPlaces[0].lastSavedAt", equalTo("2026-09-15T00:00:10Z"))
                .body("savedPlaces[1].summaryAddress", equalTo("서울 광진구"))
                .body("savedPlaces[1].roadAddress", nullValue())
                .body("savedPlaces[2].thumbnailAttribution",
                        equalTo("<a href=\"https://maps.google.com/maps/contrib/1\">작성자</a>"));
    }

    @Test
    void 저장한_장소가_없으면_빈_목록이다() {
        // given
        LoginResult login = loginAsKakao("user-9");

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(0));
    }

    @Test
    void 토큰_없이_조회하면_401이다() {
        given().when().get(SAVED_PLACES_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }
}
