package com.yeogidam.auth;

import static org.junit.jupiter.api.Assertions.*;

import com.yeogidam.auth.dto.response.TokenResponse;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.auth.service.TokenManager;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.repository.MemberRepository;
import com.yeogidam.support.MySqlTestContainer;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.json.JsonMapper;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RefreshTokenIntegrationTest {

    @DynamicPropertySource
    static void configureDatabase(DynamicPropertyRegistry registry) {
        MySqlTestContainer.registerProperties(registry);
    }

    @LocalServerPort
    private int port;

    @Autowired
    private TokenManager tokenManager;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private MemberRepository members;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JsonMapper jsonMapper;

    private Member member;
    private TokenResponse tokens;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM members");
        member = members.save(new Member(new MemberProfile(null, null, null),
                new OAuthAccount(OAuthProvider.GOOGLE, "refresh-user")));
        tokens = tokenManager.createTokens(member.id());
    }

    @Test
    void 토큰을_교체하고_원문_대신_해시를_저장하며_최초_만료일을_유지한다() throws Exception {
        // given
        String previous = tokens.refreshToken();

        // when
        Response response = refresh(previous);
        TokenResponse renewed = readTokens(response);
        String expectedHash = HexFormat.of()
                .formatHex(MessageDigest.getInstance("SHA-256")
                        .digest(renewed.refreshToken()
                                .getBytes(StandardCharsets.UTF_8)));
        String storedHash = jdbcTemplate.queryForObject("SELECT token_hash FROM refresh_sessions", String.class);

        // then
        assertAll(
                () -> Assertions.assertThat(renewed.refreshToken())
                        .isNotEqualTo(previous),
                () -> Assertions.assertThat(tokenProvider.parseAccessToken(renewed.accessToken()))
                        .isEqualTo(member.id()),
                () -> Assertions.assertThat(tokenProvider.parseRefreshToken(renewed.refreshToken())
                                .memberId())
                        .isEqualTo(member.id()),
                () -> Assertions.assertThat(renewed.refreshTokenExpiresAt())
                        .isEqualTo(tokens.refreshTokenExpiresAt()),
                () -> Assertions.assertThat(storedHash)
                        .isEqualTo(expectedHash)
                        .isNotEqualTo(renewed.refreshToken()),
                () -> Assertions.assertThat(jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM refresh_sessions", Long.class))
                        .isEqualTo(1L)
        );
    }

    @Test
    void 이전_토큰을_재사용하면_예외가_발생하고_새_토큰도_폐기한다() {
        // given
        String previous = tokens.refreshToken();
        TokenResponse renewed = readTokens(refresh(previous));

        // when
        Response reused = refresh(previous);
        Response revoked = refresh(renewed.refreshToken());

        // then
        assertAll(
                () -> Assertions.assertThat(reused.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(reused.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH401_003"),
                () -> Assertions.assertThat(revoked.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(jdbcTemplate.queryForObject(
                                "SELECT revoked FROM refresh_sessions", Boolean.class))
                        .isTrue()
        );
    }

    @Test
    void 한_세션의_토큰_재사용이_다른_로그인_세션을_폐기하지_않는다() {
        // given
        TokenResponse anotherSession = tokenManager.createTokens(member.id());
        String previous = tokens.refreshToken();
        readTokens(refresh(previous));

        // when
        Response reused = refresh(previous);
        Response other = refresh(anotherSession.refreshToken());

        // then
        assertAll(
                () -> Assertions.assertThat(reused.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(other.statusCode())
                        .isEqualTo(200)
        );
    }

    @Test
    void 로그아웃한_세션은_재발급할_수_없고_다시_로그아웃해도_성공한다() {
        // given
        String refreshToken = tokens.refreshToken();

        // when
        Response logout = post("/auth/logouts", refreshToken);
        Response renewed = refresh(refreshToken);
        Response repeatedLogout = post("/auth/logouts", refreshToken);

        // then
        assertAll(
                () -> Assertions.assertThat(logout.statusCode())
                        .isEqualTo(204),
                () -> Assertions.assertThat(renewed.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(repeatedLogout.statusCode())
                        .isEqualTo(204)
        );
    }

    @Test
    void 동일_토큰의_동시_재발급은_하나만_성공하고_재사용된_세션을_폐기한다() throws Exception {
        // given
        String refreshToken = tokens.refreshToken();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Response> request = () -> {
            ready.countDown();
            assertTrue(start.await(5, TimeUnit.SECONDS));
            return refresh(refreshToken);
        };

        // when
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Response> first = executor.submit(request);
            Future<Response> second = executor.submit(request);
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            List<Response> responses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            List<Integer> statuses = responses.stream()
                    .map(Response::statusCode)
                    .toList();
            Response success = responses.stream()
                    .filter(response -> response.statusCode() == 200)
                    .findFirst()
                    .orElseThrow();

            // then
            assertAll(
                    () -> Assertions.assertThat(statuses)
                            .containsExactlyInAnyOrder(200, 401),
                    () -> Assertions.assertThat(refresh(readTokens(success)
                                    .refreshToken())
                                    .statusCode())
                            .isEqualTo(401)
            );
        }
    }

    @Test
    void JWT가_유효해도_DB의_세션이_만료되면_예외가_발생한다() {
        // given
        jdbcTemplate.update("UPDATE refresh_sessions SET expires_at = '2000-01-01 00:00:00'");

        // when
        Response response = refresh(tokens.refreshToken());

        // then
        Assertions.assertThat(response.statusCode())
                .isEqualTo(401);
    }

    @Test
    void 회원이_삭제되면_세션도_삭제되고_재발급_시_예외가_발생한다() {
        // given
        jdbcTemplate.update("DELETE FROM members WHERE id = ?", member.id());

        // when
        Response response = refresh(tokens.refreshToken());

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM refresh_sessions", Long.class))
                        .isZero()
        );
    }

    @Test
    void 세션의_회원과_토큰의_회원이_다르면_예외가_발생한다() {
        // given
        String valid = tokens.refreshToken();
        String sessionId = tokenProvider.parseRefreshToken(valid)
                .sessionId();
        String mismatched = tokenProvider.reissueRefreshToken(
                        member.id() + 1, sessionId, tokens.refreshTokenExpiresAt())
                .value();

        // when
        Response response = refresh(mismatched);

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(refresh(valid)
                                .statusCode())
                        .isEqualTo(200)
        );
    }

    @Test
    void 액세스_토큰으로_재발급이나_로그아웃을_요청하면_예외가_발생한다() {
        // given
        String accessToken = tokens.accessToken();

        // when & then
        assertAll(
                () -> Assertions.assertThat(refresh(accessToken)
                                .statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(post("/auth/logouts", accessToken)
                                .statusCode())
                        .isEqualTo(401)
        );
    }

    private Response refresh(String refreshToken) {
        return post("/auth/token-refreshes", refreshToken);
    }

    private Response post(String path, String refreshToken) {
        return RestAssured.given()
                .port(port)
                .contentType(ContentType.JSON)
                .body(jsonMapper.writeValueAsString(Map.of("refreshToken", refreshToken)))
                .post(path);
    }

    private TokenResponse readTokens(Response response) {
        Assertions.assertThat(response.statusCode())
                .isEqualTo(200);
        return jsonMapper.readValue(response.asString(), TokenResponse.class);
    }
}
