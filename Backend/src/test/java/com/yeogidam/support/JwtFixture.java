package com.yeogidam.support;

import com.yeogidam.auth.config.AuthConfig;
import com.yeogidam.auth.config.JwtProperties;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;

/**
 * 스프링 컨텍스트 없이 토큰을 만들고 검증해야 하는 단위 테스트가 쓰는 JwtTokenProvider.
 */
public final class JwtFixture {

    public static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");
    public static final JwtProperties PROPERTIES = new JwtProperties(
            "dGVzdC1vbmx5LWtleS13aXRoLWF0LWxlYXN0LXRoaXJ0eS10d28tYnl0ZXM=",
            "yeogidam",
            Duration.ofMinutes(30),
            Duration.ofDays(30));

    private JwtFixture() {
    }

    public static JwtTokenProvider jwtTokenProvider(MutableClock clock) {
        AuthConfig config = new AuthConfig();
        SecretKey key = config.jwtSigningKey(PROPERTIES);
        return new JwtTokenProvider(
                config.jwtEncoder(key), config.jwtDecoder(key, PROPERTIES, clock), PROPERTIES, clock);
    }
}
