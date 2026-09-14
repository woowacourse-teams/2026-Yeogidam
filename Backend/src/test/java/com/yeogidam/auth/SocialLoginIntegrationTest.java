package com.yeogidam.auth;

import static org.junit.jupiter.api.Assertions.*;

import javax.crypto.SecretKey;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.yeogidam.auth.dto.response.LoginResponse;
import com.yeogidam.auth.dto.response.OAuthTokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.auth.infrastructure.oauth.apple.AppleClient;
import com.yeogidam.member.domain.Member;
import com.yeogidam.member.domain.MemberProfile;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.repository.MemberRepository;
import com.yeogidam.support.MySqlTestContainer;
import com.yeogidam.support.OAuthProviderFixture;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestOperations;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.json.JsonMapper;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SocialLoginIntegrationTest {

    private static final OAuthProviderFixture PROVIDER = new OAuthProviderFixture();

    @LocalServerPort
    private int port;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MemberRepository members;

    @Autowired
    private SecretKey jwtSigningKey;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private AppleClient appleClient;

    @DynamicPropertySource
    static void configureProvider(DynamicPropertyRegistry registry) {
        MySqlTestContainer.registerProperties(registry);
        registry.add("oauth.providers.apple.private-key", PROVIDER::applePrivateKey);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProviderTestConfig {

        @Bean
        @Primary
        RestClient testOAuthRestClient(@Qualifier("oauthRestClient") RestClient restClient) {
            return restClient.mutate()
                    .requestInterceptor(PROVIDER.redirectRequests())
                    .build();
        }

        @Bean
        @Primary
        RestOperations testOAuthJwkRestOperations(@Qualifier("oauthJwkRestOperations") RestOperations restOperations) {
            RestTemplate restTemplate = (RestTemplate) restOperations;
            restTemplate.getInterceptors()
                    .add(PROVIDER.redirectRequests());
            return restTemplate;
        }
    }

    static Stream<Arguments> invalidClaims() {
        return Stream.of(
                Arguments.of("발급자",
                        (Consumer<JWTClaimsSet.Builder>) claims -> claims.issuer("https://attacker.example")),
                Arguments.of("대상", (Consumer<JWTClaimsSet.Builder>) claims -> claims.audience("another-client")),
                Arguments.of("만료", (Consumer<JWTClaimsSet.Builder>) claims -> claims.expirationTime(
                        Date.from(Instant.now()
                                .minusSeconds(1)))),
                Arguments.of("만료 누락", (Consumer<JWTClaimsSet.Builder>) claims -> claims.expirationTime(null)),
                Arguments.of("식별자", (Consumer<JWTClaimsSet.Builder>) claims -> claims.subject(null)),
                Arguments.of("발급 시각 누락", (Consumer<JWTClaimsSet.Builder>) claims -> claims.issueTime(null)),
                Arguments.of("발급 시각", (Consumer<JWTClaimsSet.Builder>) claims -> claims.issueTime(
                        Date.from(Instant.now()
                                .plusSeconds(600)))),
                Arguments.of("사용 시각", (Consumer<JWTClaimsSet.Builder>) claims -> claims.notBeforeTime(
                        Date.from(Instant.now()
                                .plusSeconds(600)))),
                Arguments.of("허용 클라이언트",
                        (Consumer<JWTClaimsSet.Builder>) claims -> claims.claim("azp", "another-client")),
                Arguments.of("복수 대상", (Consumer<JWTClaimsSet.Builder>) claims -> claims.audience(
                        List.of("test-apple-client", "other")))
        );
    }

    @AfterAll
    static void closeProvider() {
        PROVIDER.close();
    }

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM members");
        PROVIDER.reset();
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 로그인하면_액세스와_리프레시_토큰을_함께_발급한다(String provider) {
        // when
        LoginResponse login = loginWithCode(provider, code());

        // then
        assertAll(
                () -> Assertions.assertThat(tokenProvider.parseAccessToken(login.accessToken()))
                        .isEqualTo(login.member()
                                .id()),
                () -> Assertions.assertThat(tokenProvider.parseRefreshToken(login.refreshToken())
                                .memberId())
                        .isEqualTo(login.member()
                                .id()),
                () -> Assertions.assertThat(login.refreshTokenExpiresAt())
                        .isAfter(login.expiresAt()),
                () -> Assertions.assertThat(jdbcTemplate.queryForObject(
                                "SELECT COUNT(*) FROM refresh_sessions", Long.class))
                        .isEqualTo(1L)
        );
    }

    @Test
    void 카카오_인가_코드를_교환하고_선택_정보와_회원을_저장한다() {
        // given
        String authorization = code();
        PROVIDER.respond("/kakao/user", 200, """
                {"id":123,"kakao_account":{"email":"kakao@example.com","is_email_valid":true,
                "is_email_verified":true,
                "profile":{"nickname":"러키","profile_image_url":"https://image.example.com/kakao"}}}
                """);

        // when
        LoginResponse login = loginWithCode("kakao", authorization);
        Member saved = members.findByOAuthAccount(new OAuthAccount(OAuthProvider.KAKAO, "123"))
                .orElseThrow();
        Jwt token = NimbusJwtDecoder.withSecretKey(jwtSigningKey)
                .build()
                .decode(login.accessToken());

        // then
        assertAll(
                () -> Assertions.assertThat(saved.id())
                        .isEqualTo(login.member()
                                .id()),
                () -> Assertions.assertThat(saved.profile()
                                .email())
                        .isEqualTo("kakao@example.com"),
                () -> Assertions.assertThat(saved.profile()
                                .imageUrl())
                        .isEqualTo("https://image.example.com/kakao"),
                () -> Assertions.assertThat(login.member()
                                .nickname())
                        .isEqualTo("러키"),
                () -> Assertions.assertThat(token.getSubject())
                        .isEqualTo(saved.id()
                                .toString()),
                () -> Assertions.assertThat(token.getClaimAsString("iss"))
                        .isEqualTo("yeogidam"),
                () -> Assertions.assertThat(token.getClaims())
                        .doesNotContainKeys("email", "imageUrl"),
                () -> Assertions.assertThat(PROVIDER.authorizationHeader("/kakao/user"))
                        .isEqualTo("Bearer test-kakao-token"),
                () -> Assertions.assertThat(PROVIDER.requestBody("/kakao/token"))
                        .contains("client_secret=test-kakao-secret")
        );
    }

    @Test
    void 구글은_토큰을_교환한_후_사용자_정보를_조회하고_선택_정보를_저장한다() {
        // given
        String authorization = code();
        PROVIDER.respond("/google/user", 200, """
                {"sub":"google-user","email":"google@example.com","email_verified":true,
                "name":"구글 회원","picture":"https://image.example.com/google"}
                """);

        // when
        LoginResponse login = loginWithCode("google", authorization);
        Member saved = members.findByOAuthAccount(new OAuthAccount(OAuthProvider.GOOGLE, "google-user"))
                .orElseThrow();

        // then
        assertAll(
                () -> Assertions.assertThat(saved.profile()
                                .email())
                        .isEqualTo("google@example.com"),
                () -> Assertions.assertThat(saved.profile()
                                .imageUrl())
                        .isEqualTo("https://image.example.com/google"),
                () -> Assertions.assertThat(login.member()
                                .oauthProvider())
                        .isEqualTo(OAuthProvider.GOOGLE),
                () -> Assertions.assertThat(PROVIDER.authorizationHeader("/google/user"))
                        .isEqualTo("Bearer test-google-token"),
                () -> Assertions.assertThat(
                                URLDecoder.decode(PROVIDER.requestBody("/google/token"), StandardCharsets.UTF_8))
                        .contains("redirect_uri=https://app.example.com/oauth/google"),
                () -> Assertions.assertThat(formValue(PROVIDER.requestBody("/google/token"), "code"))
                        .isEqualTo(authorization),
                () -> Assertions.assertThat(formValue(PROVIDER.requestBody("/google/token"), "client_secret"))
                        .isEqualTo("test-google-secret"),
                () -> Assertions.assertThat(PROVIDER.requestBody("/google/token"))
                        .doesNotContain("code_verifier")
        );
    }

    @Test
    void 사진_URL이_2048자를_넘어도_로그인하고_원문을_저장한다() {
        // given
        String imageUrl = "https://image.example.com/" + "a".repeat(2048);
        PROVIDER.respond("/google/user", 200,
                jsonMapper.writeValueAsString(Map.of("sub", "google-user", "picture", imageUrl)));

        // when
        LoginResponse login = loginWithCode("google", code());
        Member saved = members.findByOAuthAccount(new OAuthAccount(OAuthProvider.GOOGLE, "google-user"))
                .orElseThrow();

        // then
        assertAll(
                () -> Assertions.assertThat(login.member()
                                .imageUrl())
                        .isEqualTo(imageUrl),
                () -> Assertions.assertThat(saved.profile()
                                .imageUrl())
                        .isEqualTo(imageUrl)
        );
    }

    @Test
    void 제공자_식별자가_저장_한도를_넘으면_제공자_응답_오류가_발생한다() {
        // given
        Map<String, Object> user = Map.of("sub", "a".repeat(256));
        PROVIDER.respond("/google/user", 200, jsonMapper.writeValueAsString(user));

        // when
        Response response = post("/auth/logins/google", Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(502),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH502_002"),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @Test
    void 애플은_인가_코드를_교환하고_ID_토큰을_검증하며_사진은_비워둔다() {
        // given
        String authorization = code();
        String token = appleToken(claims -> claims
                .claim("email", "private@privaterelay.appleid.com")
                .claim("email_verified", "true"));

        // when
        Response response = postApple(authorization, token);
        LoginResponse login = readLogin(response);

        // then
        assertAll(
                () -> Assertions.assertThat(login.member()
                                .email())
                        .isEqualTo("private@privaterelay.appleid.com"),
                () -> Assertions.assertThat(login.member()
                                .imageUrl())
                        .isNull(),
                () -> Assertions.assertThat(login.member()
                                .nickname())
                        .isNull()
        );
    }

    @ParameterizedTest
    @CsvSource({"kakao,123", "google,google-user", "apple,apple-user"})
    void 재로그인에_선택_정보가_없으면_기존_프로필을_DB에서도_비운다(String provider, String providerUserId) {
        // given
        LoginResponse registered = loginWithCode(provider, code());
        jdbcTemplate.update("UPDATE members SET nickname = ?, email = ?, image_url = ? WHERE id = ?",
                "기존 닉네임", "old@example.com", "https://image.example.com/old", registered.member()
                        .id());

        // when
        LoginResponse login = loginWithCode(provider, code());
        OAuthProvider oauthProvider = OAuthProvider.valueOf(provider.toUpperCase(java.util.Locale.ROOT));
        Member saved = members.findByOAuthAccount(new OAuthAccount(oauthProvider, providerUserId))
                .orElseThrow();

        // then
        assertAll(
                () -> Assertions.assertThat(login.member()
                                .id())
                        .isEqualTo(registered.member()
                                .id()),
                () -> Assertions.assertThat(saved.profile())
                        .isEqualTo(new MemberProfile(null, null, null)),
                () -> Assertions.assertThat(login.member())
                        .isEqualTo(new MemberResponse(saved)),
                () -> Assertions.assertThat(countMembers())
                        .isEqualTo(1)
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"KAKAO", "GOOGLE", "APPLE"})
    void 선택_정보가_없어도_회원을_저장하고_재로그인한다(String provider) {
        // given
        String authorization = code();

        // when
        LoginResponse login = loginWithoutProfile(provider, authorization);
        LoginResponse relogin = loginWithoutProfile(provider, code());
        String savedNickname = jdbcTemplate.queryForObject("SELECT nickname FROM members WHERE id = ?", String.class,
                login.member()
                        .id());

        // then
        assertAll(
                () -> Assertions.assertThat(login.member()
                                .nickname())
                        .isNull(),
                () -> Assertions.assertThat(savedNickname)
                        .isNull(),
                () -> Assertions.assertThat(relogin.member()
                                .nickname())
                        .isNull(),
                () -> Assertions.assertThat(relogin.member()
                                .id())
                        .isEqualTo(login.member()
                                .id()),
                () -> Assertions.assertThat(login.member()
                                .email())
                        .isNull(),
                () -> Assertions.assertThat(login.member()
                                .imageUrl())
                        .isNull()
        );
    }

    @ParameterizedTest
    @MethodSource("invalidClaims")
    void 애플_토큰의_필수_클레임이_유효하지_않으면_예외가_발생한다(
            String reason,
            Consumer<JWTClaimsSet.Builder> customize
    ) {
        // given
        String authorization = code();
        String token = appleToken(customize);

        // when
        Response response = postApple(authorization, token);

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .as(reason)
                        .isEqualTo(401),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH401_002"),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @Test
    void 토큰_서명을_변조하면_예외가_발생한다() {
        // given
        String authorization = code();
        String token = appleToken(claims -> {
        });
        int signatureStart = token.lastIndexOf('.') + 1;
        String replacement = "A";
        if (token.charAt(signatureStart) == 'A') {
            replacement = "B";
        }
        String modified = token.substring(0, signatureStart) + replacement + token.substring(signatureStart + 1);

        // when
        Response response = postApple(authorization, modified);

        // then
        Assertions.assertThat(response.statusCode())
                .isEqualTo(401);
    }

    @Test
    void 제공자가_사용한_애플_인가_코드를_거부하면_예외가_발생한다() {
        // given
        String authorization = code();
        Map<String, String> body = Map.of("authorizationCode", authorization);
        readLogin(post("/auth/logins/apple", body));

        // when
        Response response = post("/auth/logins/apple", body);

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(401),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH401_002"),
                () -> Assertions.assertThat(countMembers())
                        .isEqualTo(1)
        );
    }

    @Test
    void 소셜_제공자의_장애를_로그인_실패와_구분한다() {
        // given
        String authorization = code();
        PROVIDER.respond("/kakao/token", 503, "{}");

        // when
        Response response = post("/auth/logins/kakao", Map.of("authorizationCode", authorization));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(502),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH502_001"),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @Test
    void 잘못된_인가_코드로_로그인하면_예외가_발생한다() {
        // given
        String authorization = code();
        PROVIDER.respond("/kakao/token", 400, "{\"error\":\"invalid_grant\"}");

        // when
        Response response = post("/auth/logins/kakao", Map.of("authorizationCode", authorization));

        // then
        Assertions.assertThat(response.jsonPath()
                        .getString("errorCode"))
                .isEqualTo("AUTH401_002");
    }

    @Test
    void 로그인_요청의_필수_입력값이_유효하지_않으면_예외가_발생한다() {
        // when & then
        assertAll(
                () -> Assertions.assertThat(post("/auth/logins/kakao", Map.of())
                                .statusCode())
                        .isEqualTo(400),
                () -> Assertions.assertThat(post("/auth/logins/google", Map.of("authorizationCode", " "))
                                .statusCode())
                        .isEqualTo(400),
                () -> Assertions.assertThat(
                                post("/auth/logins/apple", Map.of("authorizationCode", " "))
                                        .statusCode())
                        .isEqualTo(400)
        );
    }

    @Test
    void 같은_소셜_계정이_동시에_가입해도_회원은_하나만_생성한다() throws Exception {
        // given
        String first = code();
        String second = code();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        // when
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<LoginResponse> firstResult = executor.submit(concurrentLogin(first, ready, start));
            Future<LoginResponse> secondResult = executor.submit(concurrentLogin(second, ready, start));
            ready.await();
            start.countDown();
            LoginResponse firstLogin = firstResult.get();
            LoginResponse secondLogin = secondResult.get();

            // then
            assertAll(
                    () -> Assertions.assertThat(firstLogin.member()
                                    .id())
                            .isEqualTo(secondLogin.member()
                                    .id()),
                    () -> Assertions.assertThat(countMembers())
                            .isEqualTo(1)
            );
        }
    }

    @Test
    void 이메일과_제공자_회원번호가_같아도_소셜_제공자가_다르면_별도_회원이다() {
        // given
        PROVIDER.respond("/kakao/user", 200, """
                {"id":123,"kakao_account":{"email":"same@example.com",
                "is_email_valid":true,"is_email_verified":true}}
                """);
        LoginResponse kakao = loginWithCode("kakao", code());
        String googleAuthorization = code();
        PROVIDER.respond("/google/user", 200, """
                {"sub":"123","email":"same@example.com","email_verified":true}
                """);

        // when
        LoginResponse google = loginWithCode("google", googleAuthorization);

        // then
        assertAll(
                () -> Assertions.assertThat(google.member()
                                .id())
                        .isNotEqualTo(kakao.member()
                                .id()),
                () -> Assertions.assertThat(countMembers())
                        .isEqualTo(2)
        );
    }

    @Test
    void 제공자_회원번호의_대소문자를_구분한다() {
        // given
        String first = code();
        PROVIDER.respond("/google/user", 200, "{\"sub\":\"User\"}");
        LoginResponse firstLogin = loginWithCode("google", first);
        String second = code();
        PROVIDER.respond("/google/user", 200, "{\"sub\":\"user\"}");

        // when
        LoginResponse secondLogin = loginWithCode("google", second);

        // then
        assertAll(
                () -> Assertions.assertThat(secondLogin.member()
                                .id())
                        .isNotEqualTo(firstLogin.member()
                                .id()),
                () -> Assertions.assertThat(countMembers())
                        .isEqualTo(2)
        );
    }

    @ParameterizedTest
    @CsvSource({"kakao,123", "google,google-user"})
    void 재로그인하면_최신_프로필을_DB와_응답에_반영한다(String provider, String providerUserId) {
        // given
        PROVIDER.respond("/kakao/user", 200, """
                {"id":123,"kakao_account":{"email":"old@example.com",
                "is_email_valid":true,"is_email_verified":true,
                "profile":{"nickname":"기존 이름","profile_image_url":"https://image.example.com/old"}}}
                """);
        PROVIDER.respond("/google/user", 200, """
                {"sub":"google-user","email":"old@example.com","email_verified":true,
                "name":"기존 이름","picture":"https://image.example.com/old"}
                """);
        LoginResponse first = loginWithCode(provider, code());
        PROVIDER.respond("/kakao/user", 200, """
                {"id":123,"kakao_account":{"email":"new@example.com",
                "is_email_valid":true,"is_email_verified":true,
                "profile":{"nickname":"새 이름","profile_image_url":"https://image.example.com/new"}}}
                """);
        PROVIDER.respond("/google/user", 200, """
                {"sub":"google-user","email":"new@example.com","email_verified":true,
                "name":"새 이름","picture":"https://image.example.com/new"}
                """);

        // when
        LoginResponse second = loginWithCode(provider, code());
        OAuthProvider oauthProvider = OAuthProvider.valueOf(provider.toUpperCase(java.util.Locale.ROOT));
        Member saved = members.findByOAuthAccount(new OAuthAccount(oauthProvider, providerUserId))
                .orElseThrow();

        // then
        assertAll(
                () -> Assertions.assertThat(second.member()
                                .id())
                        .isEqualTo(first.member()
                                .id()),
                () -> Assertions.assertThat(saved.profile())
                        .isEqualTo(new MemberProfile("새 이름", "new@example.com", "https://image.example.com/new")),
                () -> Assertions.assertThat(second.member())
                        .isEqualTo(new MemberResponse(saved)),
                () -> Assertions.assertThat(countMembers())
                        .isEqualTo(1)
        );
    }

    @Test
    void 구글이_다른_앱의_인가_코드를_거부하면_예외가_발생한다() {
        // given
        String authorization = code();
        PROVIDER.respond("/google/token", 400, "{\"error\":\"invalid_grant\"}");

        // when
        Response response = post("/auth/logins/google", Map.of("authorizationCode", authorization));

        // then
        assertAll(
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH401_002"),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @Test
    void 애플_ID_토큰만으로는_인가_코드_교환을_대신할_수_없다() {
        // given
        String token = appleToken(claims -> {
        });

        // when
        Response response = post("/auth/logins/apple", Map.of("identityToken", token));

        // then
        Assertions.assertThat(response.statusCode())
                .isEqualTo(400);
    }

    @Test
    void 같은_인가_코드를_동시에_제출하면_제공자가_한_요청만_승인한다() throws Exception {
        // given
        String authorization = code();
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<Integer> login = () -> {
            ready.countDown();
            start.await();
            return post("/auth/logins/kakao", Map.of("authorizationCode", authorization))
                    .statusCode();
        };

        // when
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<Integer> first = executor.submit(login);
            Future<Integer> second = executor.submit(login);
            ready.await();
            start.countDown();
            List<Integer> statuses = List.of(first.get(), second.get());

            // then
            assertAll(
                    () -> Assertions.assertThat(statuses)
                            .containsExactlyInAnyOrder(200, 401),
                    () -> Assertions.assertThat(countMembers())
                            .isEqualTo(1)
            );
        }
    }

    @Test
    void 서버_준비_API와_GET_로그인_시작_API는_제공하지_않는다() {
        // when
        Response removed = post("/auth/authorizations", Map.of("provider", "KAKAO"));
        Response oldLogin = RestAssured.given()
                .port(port)
                .get("/auth/logins/kakao");

        // then
        assertAll(
                () -> Assertions.assertThat(removed.statusCode())
                        .isEqualTo(404),
                () -> Assertions.assertThat(oldLogin.statusCode())
                        .isEqualTo(405),
                () -> Assertions.assertThat(oldLogin.header("Allow"))
                        .contains("POST")
        );
    }

    @Test
    void 애플_코드_교환에_필수_네_필드와_ES256_client_secret을_전달한다() throws Exception {
        // given
        String authorizationCode = code();

        // when
        loginWithCode("apple", authorizationCode);
        String body = PROVIDER.requestBody("/apple/token");
        SignedJWT secret = SignedJWT.parse(formValue(body, "client_secret"));
        JWTClaimsSet claims = secret.getJWTClaimsSet();

        // then
        assertAll(
                () -> Assertions.assertThat(secret.verify(new ECDSAVerifier(PROVIDER.applePublicKey())))
                        .isTrue(),
                () -> Assertions.assertThat(secret.getHeader()
                                .getAlgorithm())
                        .isEqualTo(JWSAlgorithm.ES256),
                () -> Assertions.assertThat(secret.getHeader()
                                .getKeyID())
                        .isEqualTo("test-apple-key"),
                () -> Assertions.assertThat(claims.getIssuer())
                        .isEqualTo("test-team-id"),
                () -> Assertions.assertThat(claims.getSubject())
                        .isEqualTo("test-apple-client"),
                () -> Assertions.assertThat(claims.getAudience())
                        .containsExactly("https://appleid.apple.com"),
                () -> Assertions.assertThat(claims.getExpirationTime()
                                .toInstant())
                        .isAfter(Instant.now())
                        .isBefore(Instant.now()
                                .plusSeconds(301)),
                () -> Assertions.assertThat(body.split("&"))
                        .extracting(parameter -> parameter.split("=", 2)[0])
                        .containsExactlyInAnyOrder("grant_type", "client_id", "client_secret", "code"),
                () -> Assertions.assertThat(formValue(body, "grant_type"))
                        .isEqualTo("authorization_code"),
                () -> Assertions.assertThat(formValue(body, "client_id"))
                        .isEqualTo("test-apple-client"),
                () -> Assertions.assertThat(formValue(body, "code"))
                        .isEqualTo(authorizationCode)
        );
    }

    @Test
    void 애플이_발급한_리프레시_토큰을_취소하고_본문_없는_성공_응답을_처리한다() throws Exception {
        // given
        String refreshToken = "apple-refresh+token/=%2F";
        PROVIDER.respond("/apple/token", 200, jsonMapper.writeValueAsString(Map.of(
                "id_token", appleToken(claims -> {
                }), "refresh_token", refreshToken)));
        PROVIDER.respond("/apple/revoke", 200, "");
        OAuthTokenResponse token = appleClient.requestToken(code());

        // when
        appleClient.revokeToken(token.refreshToken());
        appleClient.revokeToken(token.refreshToken());
        String body = PROVIDER.requestBody("/apple/revoke");
        SignedJWT secret = SignedJWT.parse(formValue(body, "client_secret"));

        // then
        assertAll(
                () -> Assertions.assertThat(formValue(body, "token"))
                        .isEqualTo(refreshToken),
                () -> Assertions.assertThat(formValue(body, "token_type_hint"))
                        .isEqualTo("refresh_token"),
                () -> Assertions.assertThat(formValue(body, "client_id"))
                        .isEqualTo("test-apple-client"),
                () -> Assertions.assertThat(secret.verify(new ECDSAVerifier(PROVIDER.applePublicKey())))
                        .isTrue(),
                () -> Assertions.assertThat(body)
                        .doesNotContain("redirect_uri", "grant_type", "code=")
        );
    }

    @ParameterizedTest
    @CsvSource({"400,invalid_client,PROVIDER_CONFIGURATION_ERROR", "503,server_error,PROVIDER_UNAVAILABLE"})
    void 애플_토큰_취소가_실패하면_원인에_맞는_예외가_발생한다(int status, String error, AuthErrorCode expectedError) {
        // given
        PROVIDER.respond("/apple/revoke", status, jsonMapper.writeValueAsString(Map.of("error", error)));

        // when
        AuthException exception = assertThrows(AuthException.class,
                () -> appleClient.revokeToken("apple-refresh-token"));

        // then
        Assertions.assertThat(exception.getErrorCode())
                .isEqualTo(expectedError);
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 인가_코드를_이중_디코딩하지_않고_원문으로_교환한다(String provider) {
        // given
        String authorizationCode = "a+b/c=%2F한글";

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", authorizationCode));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(200),
                () -> Assertions.assertThat(formValue(PROVIDER.requestBody("/" + provider + "/token"), "code"))
                        .isEqualTo(authorizationCode)
        );
    }

    @ParameterizedTest
    @CsvSource({
            "kakao,401,invalid_grant,401,AUTH401_002", "google,400,invalid_grant,401,AUTH401_002",
            "apple,403,access_denied,401,AUTH401_002", "kakao,503,invalid_grant,502,AUTH502_001",
            "google,429,invalid_client,502,AUTH502_001", "apple,500,invalid_client,502,AUTH502_001",
            "kakao,401,invalid_client,503,AUTH503_002", "google,401,invalid_client,503,AUTH503_002",
            "apple,400,invalid_client,503,AUTH503_002", "google,400,provider-error,502,AUTH502_002"
    })
    void 토큰_요청의_인증_실패와_설정_오류_및_제공자_장애를_구분한다(
            String provider, int providerStatus, String error, int expectedStatus, String expectedCode
    ) {
        // given
        PROVIDER.respond("/" + provider + "/token", providerStatus,
                jsonMapper.writeValueAsString(Map.of("error", error)));

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(expectedStatus),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo(expectedCode),
                () -> Assertions.assertThat(countMembers())
                        .isZero(),
                () -> Assertions.assertThat(PROVIDER.requestBody("/" + provider + "/user"))
                        .isNull()
        );
    }

    @ParameterizedTest
    @CsvSource({
            "invalid_grant,KOE320,401,AUTH401_002", "invalid_grant,KOE303,503,AUTH503_002",
            "invalid_grant,KOE310,503,AUTH503_002", "invalid_request,KOE237,502,AUTH502_001"
    })
    void 카카오_세부_코드로_인가_코드_문제와_서버_설정_및_호출_제한을_구분한다(
            String error, String detail, int expectedStatus, String expectedCode
    ) {
        // given
        PROVIDER.respond("/kakao/token", 400,
                jsonMapper.writeValueAsString(Map.of("error", error, "error_code", detail)));

        // when
        Response response = post("/auth/logins/kakao", Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(expectedStatus),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo(expectedCode),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @ParameterizedTest
    @CsvSource({"kakao,401,401", "google,403,401", "kakao,500,502", "google,503,502"})
    void 사용자_정보_조회_실패를_인증_오류와_장애로_구분한다(String provider, int providerStatus, int expectedStatus) {
        // given
        PROVIDER.respond("/" + provider + "/user", providerStatus, "{}");

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(expectedStatus),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 제공자가_필수_토큰을_반환하지_않으면_예외가_발생한다(String provider) {
        // given
        PROVIDER.respond("/" + provider + "/token", 200, "{}");

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(502),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH502_002")
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 제공자_토큰_응답이_잘못된_JSON이면_예외가_발생한다(String provider) {
        // given
        PROVIDER.respond("/" + provider + "/token", 200, "{invalid-json");

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", code()));

        // then
        assertAll(
                () -> Assertions.assertThat(response.statusCode())
                        .isEqualTo(502),
                () -> Assertions.assertThat(response.jsonPath()
                                .getString("errorCode"))
                        .isEqualTo("AUTH502_002"),
                () -> Assertions.assertThat(countMembers())
                        .isZero()
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google"})
    void 제공자_사용자_정보에_식별자가_없으면_예외가_발생한다(String provider) {
        // given
        PROVIDER.respond("/" + provider + "/user", 200, "{}");

        // when
        Response response = post("/auth/logins/" + provider, Map.of("authorizationCode", code()));

        // then
        Assertions.assertThat(response.statusCode())
                .isEqualTo(401);
    }

    @ParameterizedTest
    @ValueSource(strings = {"kakao", "google", "apple"})
    void 검증되지_않은_이메일은_저장하지_않는다(String provider) {
        // given
        PROVIDER.respond("/kakao/user", 200, """
                {"id":123,"kakao_account":{"email":"unverified@example.com","is_email_valid":true,"is_email_verified":false}}
                """);
        PROVIDER.respond("/google/user", 200, """
                {"sub":"google-user","email":"unverified@example.com","email_verified":false}
                """);
        String appleToken = appleToken(claims -> claims.claim("email", "unverified@example.com")
                .claim("email_verified", false));
        PROVIDER.respond("/apple/token", 200, jsonMapper.writeValueAsString(Map.of("id_token", appleToken)));

        // when
        LoginResponse login = loginWithCode(provider, code());

        // then
        Assertions.assertThat(login.member()
                        .email())
                .isNull();
    }

    private String formValue(String form, String name) {
        for (String parameter : form.split("&")) {
            String[] pair = parameter.split("=", 2);
            if (pair[0].equals(name) && pair.length == 2) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private Callable<LoginResponse> concurrentLogin(
            String authorizationCode,
            CountDownLatch ready,
            CountDownLatch start
    ) {
        return () -> {
            ready.countDown();
            start.await();
            return loginWithCode("kakao", authorizationCode);
        };
    }

    private String code() {
        return UUID.randomUUID()
                .toString();
    }

    private LoginResponse loginWithCode(String provider, String authorizationCode) {
        return readLogin(post("/auth/logins/" + provider, Map.of("authorizationCode", authorizationCode)));
    }

    private LoginResponse loginWithoutProfile(String provider, String authorizationCode) {
        return loginWithCode(provider.toLowerCase(java.util.Locale.ROOT), authorizationCode);
    }

    private String appleToken(Consumer<JWTClaimsSet.Builder> customize) {
        return PROVIDER.sign("apple", "apple-user", null, customize);
    }

    private Response postApple(String authorizationCode, String identityToken) {
        PROVIDER.respond("/apple/token", 200, jsonMapper.writeValueAsString(Map.of("id_token", identityToken)));
        return post("/auth/logins/apple", Map.of("authorizationCode", authorizationCode));
    }

    private LoginResponse readLogin(Response response) {
        Assertions.assertThat(response.statusCode())
                .as(response.asString())
                .isEqualTo(200);
        return jsonMapper.readValue(response.asString(), LoginResponse.class);
    }

    private Response post(String path, Object body) {
        return RestAssured.given()
                .port(port)
                .contentType(ContentType.JSON)
                .body(jsonMapper.writeValueAsString(body))
                .post(path);
    }

    private int countMembers() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM members", Integer.class);
    }
}
