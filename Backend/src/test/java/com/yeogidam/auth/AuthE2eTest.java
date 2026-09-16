package com.yeogidam.auth;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.FakeOAuthClient;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * 로그인, 재발급, 로그아웃 흐름과 HTTP로 드러나는 분기(상태 코드, 에러코드, 응답 모양)를 실제 HTTP로 검증한다.
 * 제공자는 FakeOAuthClient가 대신하고, 제공자 HTTP 자체는 각 클라이언트 단위 테스트가 맡는다.
 */
class AuthE2eTest extends E2eTestSupport {

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 인가_코드로_로그인하면_토큰_쌍과_회원_정보를_돌려준다(String provider) {
        login(provider, "user-1")
                .then().statusCode(200)
                .body("accessToken", notNullValue())
                .body("refreshToken", notNullValue())
                .body("tokenType", equalTo("Bearer"))
                .body("expiresAt", notNullValue())
                .body("refreshTokenExpiresAt", notNullValue())
                .body("member.id", notNullValue())
                .body("member.nickname", equalTo(provider + "-user-1"))
                .body("member.email", equalTo("user-1@example.com"))
                .body("member.oauthProvider", equalTo(provider.toUpperCase()));
    }

    @Test
    void 같은_계정으로_다시_로그인하면_같은_회원이다() {
        // given
        int memberId = login("kakao", "user-1").then().extract().jsonPath().getInt("member.id");

        // when & then
        login("kakao", "user-1")
                .then().statusCode(200)
                .body("member.id", equalTo(memberId));
    }

    @Test
    void 제공자가_인가_코드를_거부하면_401이다() {
        login("kakao", FakeOAuthClient.REJECTED_CODE)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_002"));
    }

    @Test
    void 제공자에_연결하지_못하면_502다() {
        login("google", FakeOAuthClient.UNAVAILABLE_CODE)
                .then().statusCode(502)
                .body("errorCode", equalTo("AUTH502_001"));
    }

    @Test
    void 인가_코드가_비면_400이다() {
        given().contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\" \"}")
                .when().post("/api/v1/auth/logins/kakao")
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_001"));
    }

    @Test
    void 재발급하면_새_쌍이_나오고_이전_토큰을_다시_쓰면_401이며_새_토큰도_함께_막힌다() {
        // given
        String refreshToken = login("kakao", "user-1").then().extract().jsonPath().getString("refreshToken");

        // when
        JsonPath rotated = refresh(refreshToken)
                .then().statusCode(200)
                .extract().jsonPath();

        // then
        assertThat(rotated.getString("refreshToken")).isNotEqualTo(refreshToken);
        refresh(refreshToken)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_003"));
        refresh(rotated.getString("refreshToken"))
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
    }

    @Test
    void 로그아웃하면_그_토큰으로_재발급하지_못하고_다시_로그아웃해도_204다() {
        // given
        String refreshToken = login("kakao", "user-1").then().extract().jsonPath().getString("refreshToken");

        // when
        logout(refreshToken).then().statusCode(204);

        // then
        refresh(refreshToken)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
        logout(refreshToken).then().statusCode(204);
    }

    @Test
    void 액세스_토큰으로_재발급하거나_로그아웃하면_401이다() {
        // given
        String accessToken = login("kakao", "user-1").then().extract().jsonPath().getString("accessToken");

        // when & then
        refresh(accessToken)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
        logout(accessToken)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
    }

    @Test
    void 없는_경로는_404이고_지원하지_않는_메서드는_405다() {
        given().when().get("/nothing")
                .then().statusCode(404)
                .body("errorCode", equalTo("COMMON404_001"));
        given().when().get("/api/v1/auth/logins/kakao")
                .then().statusCode(405)
                .body("errorCode", equalTo("COMMON405_001"));
    }

    private static Response login(
            String provider,
            String authorizationCode
    ) {
        return given().contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"" + authorizationCode + "\"}")
                .when().post("/api/v1/auth/logins/" + provider);
    }

    private static Response refresh(String refreshToken) {
        return given().contentType(ContentType.JSON)
                .body("{\"refreshToken\":\"" + refreshToken + "\"}")
                .when().post("/api/v1/auth/token-refreshes");
    }

    private static Response logout(String refreshToken) {
        return given().contentType(ContentType.JSON)
                .body("{\"refreshToken\":\"" + refreshToken + "\"}")
                .when().post("/api/v1/auth/logouts");
    }
}
