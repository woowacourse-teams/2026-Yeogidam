package com.yeogidam.auth.infrastructure.oauth.apple;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.support.fixture.AppleKeyFixture;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import org.junit.jupiter.api.Test;

/**
 * 애플 client_secret은 팀 ID와 키 ID와 개인키로 만드는 ES256 JWT다. 애플이 요구하는 모양대로 만드는지 검증한다.
 */
class AppleClientSecretGeneratorTest {

    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");

    private final AppleKeyFixture appleKey = new AppleKeyFixture();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @Test
    void 팀_ID를_발급자로_앱_ID를_주체로_5분짜리_ES256_JWT를_만든다() throws Exception {
        // given
        AppleProperties properties = new AppleProperties(
                "com.yeogidamm.app", "TEAM123", "KEY123", appleKey.privateKeyPem());

        // when
        SignedJWT secret = SignedJWT.parse(new AppleClientSecretGenerator(properties, clock).generate());

        // then
        assertAll(
                () -> assertThat(secret.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.ES256),
                () -> assertThat(secret.getHeader().getKeyID()).isEqualTo("KEY123"),
                () -> assertThat(secret.verify(new ECDSAVerifier(appleKey.publicKey()))).isTrue(),
                () -> assertThat(secret.getJWTClaimsSet().getIssuer()).isEqualTo("TEAM123"),
                () -> assertThat(secret.getJWTClaimsSet().getSubject()).isEqualTo("com.yeogidamm.app"),
                () -> assertThat(secret.getJWTClaimsSet().getAudience()).containsExactly("https://appleid.apple.com"),
                () -> assertThat(secret.getJWTClaimsSet().getExpirationTime())
                        .isEqualTo(Date.from(NOW.plus(Duration.ofMinutes(5))))
        );
    }

    @Test
    void 설정이_비어_있으면_설정_미비_예외가_발생한다() {
        assertNotConfigured(new AppleProperties("com.yeogidamm.app", "TEAM123", "KEY123", " "));
    }

    @Test
    void 개인키가_올바르지_않으면_설정_미비_예외가_발생한다() {
        assertNotConfigured(new AppleProperties("com.yeogidamm.app", "TEAM123", "KEY123", "not-a-pem"));
    }

    private void assertNotConfigured(AppleProperties properties) {
        assertThatThrownBy(() -> new AppleClientSecretGenerator(properties, clock).generate())
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
    }
}
