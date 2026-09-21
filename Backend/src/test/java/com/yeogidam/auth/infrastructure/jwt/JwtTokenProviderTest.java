package com.yeogidam.auth.infrastructure.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.config.AuthConfig;
import com.yeogidam.auth.config.JwtProperties;
import com.yeogidam.auth.domain.token.RefreshTokenClaims;
import com.yeogidam.auth.domain.token.Token;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.support.fixture.MutableClock;
import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * 토큰 발급과 파싱은 외부 의존이 없는 순수 규칙이라 AuthConfig가 만드는 인코더와 디코더로 단위 검증한다.
 */
class JwtTokenProviderTest {

    private static final String SECRET = "dGVzdC1vbmx5LWtleS13aXRoLWF0LWxlYXN0LXRoaXJ0eS10d28tYnl0ZXM=";
    private static final String OTHER_SECRET = "YW5vdGhlci10ZXN0LWtleS13aXRoLXRoaXJ0eS10d28tYnl0ZXMhIQ==";
    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");
    private static final JwtProperties PROPERTIES = new JwtProperties(
            SECRET, "yeogidam", Duration.ofMinutes(30), Duration.ofDays(30));

    private final MutableClock clock = new MutableClock(NOW);
    private final JwtTokenProvider provider = createProvider(PROPERTIES, clock);

    @Test
    void 액세스_토큰은_회원_식별자와_만료를_담는다() {
        // when
        Token token = provider.createAccessToken(7L);

        // then
        assertAll(
                () -> assertThat(provider.parseAccessToken(token.value())).isEqualTo(7L),
                () -> assertThat(token.expiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(30)))
        );
    }

    @Test
    void 리프레시_토큰은_회원_식별자와_세션_식별자를_담는다() {
        // when
        Token token = provider.createRefreshToken(7L, "session-1");

        // then
        assertAll(
                () -> assertThat(provider.parseRefreshToken(token.value()))
                        .isEqualTo(new RefreshTokenClaims(7L, "session-1")),
                () -> assertThat(token.expiresAt()).isEqualTo(NOW.plus(Duration.ofDays(30)))
        );
    }

    @Test
    void 재발급한_리프레시_토큰은_처음_만료를_그대로_쓴다() {
        // given
        Instant originalExpiry = NOW.plus(Duration.ofDays(10));
        clock.advance(Duration.ofDays(5));

        // when
        Token reissued = provider.reissueRefreshToken(7L, "session-1", originalExpiry);

        // then
        assertThat(reissued.expiresAt()).isEqualTo(originalExpiry);
    }

    @Test
    void 액세스_토큰을_리프레시_토큰으로_파싱하면_예외가_발생한다() {
        // given
        String accessToken = provider.createAccessToken(7L).value();

        // when & then
        assertInvalidToken(() -> provider.parseRefreshToken(accessToken));
    }

    @Test
    void 리프레시_토큰을_액세스_토큰으로_파싱하면_예외가_발생한다() {
        // given
        String refreshToken = provider.createRefreshToken(7L, "session-1").value();

        // when & then
        assertInvalidToken(() -> provider.parseAccessToken(refreshToken));
    }

    @Test
    void 만료된_토큰은_예외가_발생한다() {
        // given
        String accessToken = provider.createAccessToken(7L).value();
        clock.advance(Duration.ofMinutes(31));

        // when & then
        assertInvalidToken(() -> provider.parseAccessToken(accessToken));
    }

    @Test
    void 다른_키로_서명한_토큰은_예외가_발생한다() {
        // given
        JwtProperties otherProperties = new JwtProperties(
                OTHER_SECRET, "yeogidam", Duration.ofMinutes(30), Duration.ofDays(30));
        String foreign = createProvider(otherProperties, clock).createAccessToken(7L).value();

        // when & then
        assertInvalidToken(() -> provider.parseAccessToken(foreign));
    }

    @Test
    void 발급자가_다른_토큰은_예외가_발생한다() {
        // given
        JwtProperties otherIssuer = new JwtProperties(
                SECRET, "someone-else", Duration.ofMinutes(30), Duration.ofDays(30));
        String foreign = createProvider(otherIssuer, clock).createAccessToken(7L).value();

        // when & then
        assertInvalidToken(() -> provider.parseAccessToken(foreign));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "not.a.jwt"})
    void 비어_있거나_형식이_깨진_토큰은_예외가_발생한다(String token) {
        assertInvalidToken(() -> provider.parseAccessToken(token));
    }

    private static JwtTokenProvider createProvider(
            JwtProperties properties,
            MutableClock clock
    ) {
        AuthConfig config = new AuthConfig();
        SecretKey key = config.jwtSigningKey(properties);
        return new JwtTokenProvider(
                config.jwtEncoder(key), config.jwtDecoder(key, properties, clock), properties, clock);
    }

    private static void assertInvalidToken(ThrowingCallable callable) {
        assertThatThrownBy(callable)
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_TOKEN);
    }
}
