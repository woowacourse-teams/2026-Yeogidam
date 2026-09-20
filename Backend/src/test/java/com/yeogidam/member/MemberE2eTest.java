package com.yeogidam.member;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.member.exception.MemberErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 내 정보 조회와 인가 계약(토큰 없음, 잘못된 토큰, 회원 없음)을 실제 HTTP로 검증한다.
 * 인터셉터와 리졸버의 규칙 자체는 단위 테스트가 맡고, 여기서는 401과 404가 응답으로 드러나는지만 본다.
 */
class MemberE2eTest extends E2eTestSupport {

    private static final String ME_PATH = "/api/v1/members/me";
    private static final String REFRESH_PATH = "/api/v1/auth/token-refreshes";
    private static final String DELETE_AUTHORIZATION_CODE = "delete-user";

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
    void 토큰_없이_조회하면_401_예외를_던진다() {
        given().when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 잘못된_토큰으로_조회하면_401_예외를_던진다() {
        givenBearer("invalid.jwt.token")
                .when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.INVALID_TOKEN.getCode()));
    }

    @Test
    void 리프레시_토큰으로_조회하면_401_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.refreshToken())
                .when().get(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.INVALID_TOKEN.getCode()));
    }

    @Test
    void 회원이_지워진_뒤_남은_토큰으로_조회하면_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        jdbcTemplate.update("DELETE FROM members WHERE id = ?", login.memberId());

        // when & then
        givenBearer(login.accessToken())
                .when().get(ME_PATH)
                .then().statusCode(404)
                .body("errorCode", equalTo(MemberErrorCode.NOT_FOUND.getCode()));
    }

    @Test
    void 회원_탈퇴에_성공하면_204를_반환하고_회원별_데이터는_삭제하며_공용_게시물과_장소_정보는_보존한다() {
        // given
        LoginResult login = loginAsKakao(DELETE_AUTHORIZATION_CODE);
        loginAsKakao(DELETE_AUTHORIZATION_CODE); // 같은 회원의 두 번째 리프레시 세션
        insertMemberActivityData(login.memberId());

        // when
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"" + DELETE_AUTHORIZATION_CODE + "\"}")
                .when().delete(ME_PATH)
                .then().statusCode(204);

        // then
        // 회원이 소유한 회원, 세션, 공유, 보관함 데이터는 삭제한다.
        assertThat(count("members")).isZero();
        assertThat(count("refresh_sessions")).isZero();
        assertThat(count("shared_media")).isZero();
        assertThat(count("saved_places")).isZero();
        assertThat(count("place_candidates")).isZero();
        assertThat(count("shared_media_saved_places")).isZero();
        assertThat(count("shared_media_reports")).isZero();

        // 회원에 귀속되지 않는 공용 게시물·장소 정보는 삭제하지 않는다.
        assertThat(count("media")).isEqualTo(1L);
        assertThat(count("places")).isEqualTo(1L);
        assertThat(count("media_places")).isEqualTo(1L);
    }

    @Test
    void 탈퇴한_회원의_리프레시_토큰으로_재발급하면_401_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("refresh-after-deletion");
        deleteMember(login, "refresh-after-deletion");

        // when & then
        given().contentType(ContentType.JSON)
                .body("{\"refreshToken\":\"" + login.refreshToken() + "\"}")
                .when().post(REFRESH_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.INVALID_TOKEN.getCode()));
    }

    @Test
    void 제공자_연결_해제에_실패하면_회원과_세션을_삭제하지_않고_502_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("provider-unavailable-user");

        // when
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"unavailable-code\"}")
                .when().delete(ME_PATH)
                .then().statusCode(502)
                .body("errorCode", equalTo(AuthErrorCode.PROVIDER_UNAVAILABLE.getCode()));

        // then
        assertThat(count("members")).isEqualTo(1L);
        assertThat(count("refresh_sessions")).isEqualTo(1L);
    }

    @Test
    void 인가_코드의_소셜_계정이_현재_회원과_다르면_탈퇴하지_않고_401_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("delete-target");

        // when
        // 액세스 토큰은 delete-target 회원의 것이지만 인가 코드는 another-user 계정의 것이다.
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"another-user\"}")
                .when().delete(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.INVALID_CREDENTIAL.getCode()));

        // then
        assertThat(count("members")).isEqualTo(1L);
        assertThat(count("refresh_sessions")).isEqualTo(1L);
    }

    @Test
    void 액세스_토큰_없이_탈퇴하면_401_예외를_던진다() {
        given().contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"" + DELETE_AUTHORIZATION_CODE + "\"}")
                .when().delete(ME_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    private void deleteMember(LoginResult login, String authorizationCode) {
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"" + authorizationCode + "\"}")
                .when().delete(ME_PATH)
                .then().statusCode(204);
    }

    private void insertMemberActivityData(Long memberId) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, extraction_status, extraction_version, source_type
                )
                VALUES (201, 'delete-media', 'SUCCEEDED', 1, 'SEEDED')
                """);
        jdbcTemplate.update("""
                INSERT INTO places (
                    id, kakao_place_id, name, land_lot_address, latitude, longitude
                )
                VALUES (301, 'delete-place', '탈퇴 테스트 장소', '서울시 마포구', 37.5500000000, 126.9000000000)
                """);
        jdbcTemplate.update("""
                INSERT INTO media_places (id, media_id, place_id)
                VALUES (401, 201, 301)
                """);
        jdbcTemplate.update("""
                INSERT INTO shared_media (id, member_id, media_id, shared_url)
                VALUES (101, ?, 201, 'https://www.instagram.com/reel/delete-test/')
                """, memberId);
        jdbcTemplate.update("""
                INSERT INTO place_candidates (id, shared_media_id, place_id)
                VALUES (501, 101, 301)
                """);
        jdbcTemplate.update("""
                INSERT INTO saved_places (id, member_id, place_id)
                VALUES (601, ?, 301)
                """, memberId);
        jdbcTemplate.update("""
                INSERT INTO shared_media_saved_places (id, saved_place_id, shared_media_id)
                VALUES (701, 601, 101)
                """);
        jdbcTemplate.update("""
                INSERT INTO shared_media_reports (id, shared_media_id)
                VALUES (801, 101)
                """);
    }

    private long count(String tableName) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + tableName, Long.class);
    }
}
