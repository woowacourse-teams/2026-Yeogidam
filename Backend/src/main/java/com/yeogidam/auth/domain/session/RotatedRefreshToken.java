package com.yeogidam.auth.domain.session;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;

/**
 * 방금 교체된 리프레시 토큰의 해시와 교체 시각. 교체 뒤 10초 안에 같은 토큰이 다시 오면 앱과 공유 확장의 동시 재발급으로 보고 유예한다.
 */
public record RotatedRefreshToken(
        String tokenHash,
        Instant rotatedAt
) {

    public static final Duration GRACE_PERIOD = Duration.ofSeconds(10);

    public boolean isInGrace(String tokenHash, Instant now) {
        return matches(tokenHash) && !isExpired(now);
    }

    public boolean isExpired(Instant now) {
        return now.isAfter(rotatedAt.plus(GRACE_PERIOD));
    }

    private boolean matches(String tokenHash) {
        return MessageDigest.isEqual(
                this.tokenHash.getBytes(StandardCharsets.UTF_8),
                tokenHash.getBytes(StandardCharsets.UTF_8));
    }
}
