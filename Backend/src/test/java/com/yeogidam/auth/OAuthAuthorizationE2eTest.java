package com.yeogidam.auth;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.E2eTestSupport;
import io.restassured.response.Response;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 앱이 인가 URL을 받고, 제공자가 돌려준 인가 코드를 서버 콜백이 앱 스킴으로 넘기는 흐름을 실제 HTTP로 검증한다.
 * 기대값은 test 프로필의 oauth 설정에서 오고, state의 서명과 만료 규칙은 JwtTokenProviderTest가 맡는다.
 */
class OAuthAuthorizationE2eTest extends E2eTestSupport {

    private static final String APP_CALLBACK_URI = "com.yeogidamm.app://auth-callback";

    @Test
    void 로그인하지_않은_앱이_카카오_인가_URL을_받는다() {
        // when
        String authorizationUrl = readAuthorizationUrl("kakao");

        // then
        MultiValueMap<String, String> params = readQueryParams(authorizationUrl);
        assertAll(
                () -> assertThat(authorizationUrl).startsWith("https://kauth.kakao.com/oauth/authorize?"),
                () -> assertThat(params.getFirst("client_id")).isEqualTo("test-kakao-client"),
                () -> assertThat(params.getFirst("redirect_uri")).isEqualTo("https://app.example.com/oauth/kakao"),
                () -> assertThat(params.getFirst("response_type")).isEqualTo("code"),
                () -> assertThat(params.getFirst("state")).isNotBlank()
        );
    }

    @Test
    void 구글_인가_URL에는_사용자_정보를_읽을_scope가_들어_있다() {
        // when
        String authorizationUrl = readAuthorizationUrl("google");

        // then
        MultiValueMap<String, String> params = readQueryParams(authorizationUrl);
        assertAll(
                () -> assertThat(authorizationUrl).startsWith("https://accounts.google.com/o/oauth2/v2/auth?"),
                () -> assertThat(params.getFirst("client_id")).isEqualTo("test-google-client"),
                () -> assertThat(params.getFirst("redirect_uri")).isEqualTo("https://app.example.com/oauth/google"),
                () -> assertThat(params.getFirst("response_type")).isEqualTo("code"),
                () -> assertThat(params.getFirst("scope")).isEqualTo("openid%20email%20profile"),
                () -> assertThat(params.getFirst("state")).isNotBlank()
        );
    }

    @ParameterizedTest
    @CsvSource({"kakao, kakao-code", "google, 4/0Ab-google-code"})
    void 제공자가_돌려준_인가_코드를_앱_스킴으로_넘긴다(String provider, String code) {
        // given
        String state = readState(provider);

        // when
        Response response = callback(provider, Map.of("code", code, "state", state));

        // then
        response.then()
                .statusCode(HttpStatus.FOUND.value())
                .header("Location", APP_CALLBACK_URI + "?provider=" + provider + "&code=" + code);
    }

    @Test
    void 사용자가_로그인을_취소하면_오류를_앱_스킴으로_넘긴다() {
        // given
        String state = readState("kakao");

        // when
        Response response = callback("kakao", Map.of("error", "access_denied", "state", state));

        // then
        response.then()
                .statusCode(HttpStatus.FOUND.value())
                .header("Location", APP_CALLBACK_URI + "?provider=kakao&error=access_denied");
    }

    @Test
    void 서버가_만든_값이_아닌_state로_콜백이_오면_400_예외를_던진다() {
        // when
        Response response = callback("kakao", Map.of("code", "kakao-code", "state", "forged-state"));

        // then
        response.then()
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("errorCode", equalTo("AUTH400_001"));
    }

    private static String readAuthorizationUrl(String provider) {
        return given()
                .when()
                .get("/oauth/" + provider + "/authorize")
                .then()
                .statusCode(HttpStatus.OK.value())
                .extract()
                .jsonPath()
                .getString("authorizationUrl");
    }

    private static String readState(String provider) {
        return readQueryParams(readAuthorizationUrl(provider)).getFirst("state");
    }

    private static MultiValueMap<String, String> readQueryParams(String url) {
        return UriComponentsBuilder.fromUriString(url)
                .build()
                .getQueryParams();
    }

    private static Response callback(String provider, Map<String, String> params) {
        return given()
                .redirects()
                .follow(false)
                .queryParams(params)
                .when()
                .get("/oauth/" + provider + "/callback");
    }
}
