package com.yeogidam.auth.infrastructure.jwt;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.*;

import com.yeogidam.auth.config.AuthConfig;
import com.yeogidam.auth.config.JwtProperties;
import com.yeogidam.auth.domain.token.Token;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;
import javax.crypto.SecretKey;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

class JwtTokenProviderTest {

    private static final Instant NOW = Instant.parse("2026-09-10T00:00:00Z");
    private static final String SECRET = "dGVzdC1vbmx5LWtleS13aXRoLWF0LWxlYXN0LXRoaXJ0eS10d28tYnl0ZXM=";

    private final Clock clock = Clock.fixed(NOW.plusMillis(123), ZoneOffset.UTC);
    private final JwtProperties properties = new JwtProperties(SECRET, "yeogidam", Duration.ofMinutes(30),
            Duration.ofDays(30));
    private final AuthConfig config = new AuthConfig();
    private final SecretKey key = config.jwtSigningKey(properties);
    private final JwtEncoder encoder = config.jwtEncoder(key);
    private final JwtTokenProvider provider = new JwtTokenProvider(encoder, config.jwtDecoder(key, properties, clock),
            properties, clock);

    static Stream<Arguments> invalidClaims() {
        return Stream.of(
                Arguments.of("다른 발급자", (Consumer<JwtClaimsSet.Builder>) claims -> claims.issuer("another-service")),
                Arguments.of("만료 시점", (Consumer<JwtClaimsSet.Builder>) claims -> claims.expiresAt(NOW)),
                Arguments.of("만료 누락", (Consumer<JwtClaimsSet.Builder>) claims -> claims.claims(
                        values -> values.remove("exp"))),
                Arguments.of("회원 누락", (Consumer<JwtClaimsSet.Builder>) claims -> claims.claims(
                        values -> values.remove("sub"))),
                Arguments.of("잘못된 회원", (Consumer<JwtClaimsSet.Builder>) claims -> claims.subject("-1")),
                Arguments.of("숫자가 아닌 회원", (Consumer<JwtClaimsSet.Builder>) claims -> claims.subject("member")),
                Arguments.of("식별자 누락", (Consumer<JwtClaimsSet.Builder>) claims -> claims.claims(
                        values -> values.remove("jti"))),
                Arguments.of("공백 식별자", (Consumer<JwtClaimsSet.Builder>) claims -> claims.id(" ")),
                Arguments.of("종류 누락", (Consumer<JwtClaimsSet.Builder>) claims -> claims.claims(
                        values -> values.remove("token_type"))),
                Arguments.of("발급 시각 누락", (Consumer<JwtClaimsSet.Builder>) claims -> claims.claims(
                        values -> values.remove("iat"))),
                Arguments.of("미래 발급", (Consumer<JwtClaimsSet.Builder>) claims -> claims.issuedAt(NOW.plusSeconds(120)))
        );
    }

    @Test
    void 설정된_기간으로_발급하고_회원과_세션을_검증한다() {
        // given
        String sessionId = UUID.randomUUID()
                .toString();
        Instant refreshExpiresAt = NOW.plus(Duration.ofDays(30));

        // when
        Token access = provider.createAccessToken(1L);
        Token refresh = provider.createRefreshToken(1L, sessionId);
        JwtDecoder decoder = config.jwtDecoder(key, properties, clock);
        Jwt accessJwt = decoder.decode(access.value());
        Jwt refreshJwt = decoder.decode(refresh.value());

        // then
        assertAll(
                () -> assertThat(provider.parseAccessToken(access.value()))
                        .isEqualTo(1L),
                () -> assertThat(access.expiresAt())
                        .isEqualTo(NOW.plus(Duration.ofMinutes(30))),
                () -> assertThat(accessJwt.getIssuedAt())
                        .isEqualTo(NOW),
                () -> assertThat(accessJwt.getExpiresAt())
                        .isEqualTo(access.expiresAt()),
                () -> assertThat(accessJwt.getClaims())
                        .doesNotContainKey("sid"),
                () -> assertThat(provider.parseRefreshToken(refresh.value())
                                .sessionId())
                        .isEqualTo(sessionId),
                () -> assertThat(provider.parseRefreshToken(refresh.value())
                                .memberId())
                        .isEqualTo(1L),
                () -> assertThat(refresh.expiresAt())
                        .isEqualTo(refreshExpiresAt),
                () -> assertThat(refreshJwt.getIssuedAt())
                        .isEqualTo(NOW),
                () -> assertThat(refreshJwt.getExpiresAt())
                        .isEqualTo(refresh.expiresAt())
        );
    }

    @Test
    void 액세스와_리프레시_토큰을_서로_대신_사용하면_예외가_발생한다() {
        // given
        Token access = provider.createAccessToken(1L);
        Token refresh = provider.createRefreshToken(1L, "session");

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> provider.parseAccessToken(refresh.value()))
                        .isInstanceOf(AuthException.class),
                () -> assertThatThrownBy(() -> provider.parseRefreshToken(access.value()))
                        .isInstanceOf(AuthException.class)
        );
    }

    @Test
    void 같은_시각에_발급해도_서로_다른_리프레시_토큰을_생성한다() {
        // when
        Token first = provider.createRefreshToken(1L, "session");
        Token second = provider.createRefreshToken(1L, "session");

        // then
        assertAll(
                () -> assertThat(first.value())
                        .isNotEqualTo(second.value()),
                () -> assertThat(first.expiresAt())
                        .isEqualTo(NOW.plus(Duration.ofDays(30))),
                () -> assertThat(second.expiresAt())
                        .isEqualTo(first.expiresAt())
        );
    }

    @Test
    void 시간이_지난_뒤_재발급해도_기존_만료_시각과_회원과_세션을_유지한다() {
        // given
        Token original = provider.createRefreshToken(1L, "session");
        Clock laterClock = Clock.offset(clock, Duration.ofDays(7));
        JwtDecoder laterDecoder = config.jwtDecoder(key, properties, laterClock);
        JwtTokenProvider laterProvider = new JwtTokenProvider(encoder, laterDecoder, properties, laterClock);

        // when
        Token reissued = laterProvider.reissueRefreshToken(1L, "session", original.expiresAt());
        Jwt jwt = laterDecoder.decode(reissued.value());

        // then
        assertAll(
                () -> assertThat(reissued.value())
                        .isNotEqualTo(original.value()),
                () -> assertThat(reissued.expiresAt())
                        .isEqualTo(original.expiresAt()),
                () -> assertThat(jwt.getExpiresAt())
                        .isEqualTo(original.expiresAt()),
                () -> assertThat(jwt.getIssuedAt())
                        .isEqualTo(NOW.plus(Duration.ofDays(7))),
                () -> assertThat(laterProvider.parseRefreshToken(reissued.value()))
                        .isEqualTo(provider.parseRefreshToken(original.value()))
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "invalid-token"})
    void 토큰이_비어_있거나_형식이_잘못되면_예외가_발생한다(String token) {
        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> provider.parseAccessToken(token))
                        .isInstanceOfSatisfying(AuthException.class,
                                exception -> assertThat(exception.getErrorCode())
                                        .isEqualTo(AuthErrorCode.INVALID_TOKEN)),
                () -> assertThatThrownBy(() -> provider.parseRefreshToken(token))
                        .isInstanceOfSatisfying(AuthException.class,
                                exception -> assertThat(exception.getErrorCode())
                                        .isEqualTo(AuthErrorCode.INVALID_TOKEN))
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidClaims")
    void 서명이_정상이어도_필수_클레임이_잘못되면_예외가_발생한다(String description, Consumer<JwtClaimsSet.Builder> customize) {
        // given
        String token = createSignedToken(customize, encoder);

        // when & then
        assertThatThrownBy(() -> provider.parseAccessToken(token))
                .isInstanceOfSatisfying(AuthException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(AuthErrorCode.INVALID_TOKEN));
    }

    @Test
    void 다른_키로_서명한_토큰이면_예외가_발생한다() {
        // given
        JwtProperties other = new JwtProperties("YW5vdGhlci10ZXN0LWtleS13aXRoLWF0LWxlYXN0LTMyLWJ5dGVz",
                "yeogidam", Duration.ofMinutes(30), Duration.ofDays(30));
        JwtEncoder otherEncoder = config.jwtEncoder(config.jwtSigningKey(other));
        String token = createSignedToken(claims -> {
        }, otherEncoder);

        // when & then
        assertThatThrownBy(() -> provider.parseAccessToken(token))
                .isInstanceOf(AuthException.class);
    }

    @Test
    void 리프레시_토큰의_세션이_누락되면_예외가_발생한다() {
        // given
        String token = createSignedToken(claims -> claims.claim("token_type", "refresh"), encoder);

        // when & then
        assertThatThrownBy(() -> provider.parseRefreshToken(token))
                .isInstanceOf(AuthException.class);
    }

    private String createSignedToken(Consumer<JwtClaimsSet.Builder> customize, JwtEncoder signingEncoder) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject("1")
                .id(UUID.randomUUID()
                        .toString())
                .issuedAt(NOW.minusSeconds(1))
                .expiresAt(NOW.plusSeconds(600))
                .claim("token_type", "access");
        customize.accept(claims);
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256)
                .type("JWT")
                .build();
        return signingEncoder.encode(JwtEncoderParameters.from(header, claims.build()))
                .getTokenValue();
    }
}
