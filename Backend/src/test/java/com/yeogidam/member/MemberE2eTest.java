package com.yeogidam.member;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 내 정보 조회와 인가 계약(토큰 없음, 잘못된 토큰, 회원 없음)을 실제 HTTP로 검증한다.
 * 인터셉터와 리졸버의 규칙 자체는 단위 테스트가 맡고, 여기서는 401과 404가 응답으로 드러나는지만 본다.
 */
class MemberE2eTest extends E2eTestSupport {

    private static final String ME_PATH = "/api/v1/members/me";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 로그인한_회원은_내_정보를_조회할_수_있다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .when().get(ME_PATH)
                .then().statusCode(200)
                .body("id", equalTo(login.memberId().intValue()))
                .body("nickname", equalTo("kakao-user-1"))
                .body("email", equalTo("user-1@example.com"))
                .body("oauthProvider", equalTo("KAKAO"));
    }

    @Test
    void 토큰_없이_조회하면_401이다() {
        given().when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 잘못된_토큰으로_조회하면_401이다() {
        givenBearer("invalid.jwt.token")
                .when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
    }

    @Test
    void 리프레시_토큰으로_조회하면_401이다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.refreshToken())
                .when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_001"));
    }

    @Test
    void 회원이_지워진_뒤_남은_토큰으로_조회하면_404다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        jdbcTemplate.update("DELETE FROM members WHERE id = ?", login.memberId());

        // when & then
        givenBearer(login.accessToken())
                .when().get(ME_PATH)
                .then().statusCode(404)
                .body("errorCode", equalTo("USER404_001"));
    }
}
