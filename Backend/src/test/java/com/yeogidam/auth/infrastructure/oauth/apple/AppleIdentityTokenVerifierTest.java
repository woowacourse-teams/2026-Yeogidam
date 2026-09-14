package com.yeogidam.auth.infrastructure.oauth.apple;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.nimbusds.jwt.JWTClaimsSet;
import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.support.ProviderKeyFixture;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

/**
 * 애플 JWKS는 HTTP 경계에서 끊고, 서명과 발급자와 대상과 시각을 판정하는 우리 규칙을 검증한다.
 */
class AppleIdentityTokenVerifierTest {

    private static final String JWKS_URI = "https://appleid.apple.com/auth/keys";
    private static final String CLIENT_ID = "com.yeogidamm.app";
    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");
    private static final AppleProperties PROPERTIES = new AppleProperties(CLIENT_ID, "TEAM", "KEY", "pem");

    private final ProviderKeyFixture appleKey = new ProviderKeyFixture("apple-kid");
    private final RestTemplate jwksRestTemplate = new RestTemplate();
    private final MockRestServiceServer jwksServer = MockRestServiceServer.bindTo(jwksRestTemplate).build();
    private final AppleIdentityTokenVerifier verifier = new AppleIdentityTokenVerifier(
            PROPERTIES, jwksRestTemplate, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void 서명과_발급자와_대상이_맞으면_클레임을_돌려준다() {
        // given
        respondJwks(appleKey);
        String token = appleKey.sign(appleKey.appleClaims(CLIENT_ID, "001234.user", NOW).build());

        // when
        Jwt jwt = verifier.verify(token);

        // then
        assertThat(jwt.getSubject()).isEqualTo("001234.user");
    }

    @Test
    void 대상이_여럿이어도_azp가_우리_앱이면_통과한다() {
        // given
        respondJwks(appleKey);
        String token = appleKey.sign(appleKey.appleClaims(CLIENT_ID, "001234.user", NOW)
                .audience(List.of(CLIENT_ID, "other-app"))
                .claim("azp", CLIENT_ID)
                .build());

        // when & then
        assertThat(verifier.verify(token).getSubject()).isEqualTo("001234.user");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidClaims")
    void 필수_클레임이_맞지_않으면_자격증명_예외가_발생한다(
            String reason,
            Consumer<JWTClaimsSet.Builder> customize
    ) {
        // given
        respondJwks(appleKey);
        JWTClaimsSet.Builder claims = appleKey.appleClaims(CLIENT_ID, "001234.user", NOW);
        customize.accept(claims);

        // when & then
        assertInvalidCredential(appleKey.sign(claims.build()));
    }

    private static Stream<Arguments> invalidClaims() {
        return Stream.of(
                Arguments.of("발급자", customizer(claims -> claims.issuer("https://accounts.google.com"))),
                Arguments.of("대상", customizer(claims -> claims.audience("other-app"))),
                Arguments.of("복수 대상에 azp 없음", customizer(claims -> claims.audience(List.of(CLIENT_ID, "other")))),
                Arguments.of("azp가 다른 앱", customizer(claims -> claims.claim("azp", "other-app"))),
                Arguments.of("만료", customizer(claims -> claims.expirationTime(Date.from(NOW.minusSeconds(1))))),
                Arguments.of("만료 누락", customizer(claims -> claims.expirationTime(null))),
                Arguments.of("발급 시각 누락", customizer(claims -> claims.issueTime(null))),
                Arguments.of("발급 시각이 미래",
                        customizer(claims -> claims.issueTime(Date.from(NOW.plus(Duration.ofMinutes(2)))))),
                Arguments.of("주체 누락", customizer(claims -> claims.subject(null)))
        );
    }

    private static Consumer<JWTClaimsSet.Builder> customizer(Consumer<JWTClaimsSet.Builder> consumer) {
        return consumer;
    }

    @Test
    void 다른_키로_서명한_토큰은_자격증명_예외가_발생한다() {
        // given
        respondJwks(appleKey);
        ProviderKeyFixture forgedKey = new ProviderKeyFixture("apple-kid");

        // when & then
        assertInvalidCredential(forgedKey.sign(forgedKey.appleClaims(CLIENT_ID, "001234.user", NOW).build()));
    }

    @Test
    void 토큰이_비어_있으면_자격증명_예외가_발생한다() {
        assertInvalidCredential(" ");
    }

    @Test
    void JWKS를_받지_못하면_제공자_장애_예외가_발생한다() {
        // given
        jwksServer.expect(manyTimes(), requestTo(JWKS_URI)).andRespond(withServerError());
        String token = appleKey.sign(appleKey.appleClaims(CLIENT_ID, "001234.user", NOW).build());

        // when & then
        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.PROVIDER_UNAVAILABLE);
    }

    private void respondJwks(ProviderKeyFixture key) {
        jwksServer.expect(manyTimes(), requestTo(JWKS_URI))
                .andRespond(withSuccess(key.jwksJson(), MediaType.APPLICATION_JSON));
    }

    private void assertInvalidCredential(String token) {
        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_CREDENTIAL);
    }
}
