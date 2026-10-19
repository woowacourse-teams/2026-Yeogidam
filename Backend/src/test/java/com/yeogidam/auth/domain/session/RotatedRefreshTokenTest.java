package com.yeogidam.auth.domain.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RotatedRefreshTokenTest {

    private static final Instant ROTATED_AT = Instant.parse("2026-09-15T00:00:00Z");

    private final RotatedRefreshToken rotatedToken = new RotatedRefreshToken("hash-1", ROTATED_AT);

    @Test
    void 교체하고_10초까지는_같은_토큰을_유예한다() {
        assertAll(
                () -> assertThat(rotatedToken.isInGrace("hash-1", ROTATED_AT)).isTrue(),
                () -> assertThat(rotatedToken.isInGrace("hash-1", ROTATED_AT.plus(Duration.ofSeconds(10)))).isTrue()
        );
    }

    @Test
    void 교체하고_10초가_지났거나_다른_토큰이면_유예하지_않는다() {
        assertAll(
                () -> assertThat(rotatedToken.isInGrace("hash-1", ROTATED_AT.plus(Duration.ofSeconds(10)).plusNanos(1)))
                        .isFalse(),
                () -> assertThat(rotatedToken.isInGrace("hash-2", ROTATED_AT)).isFalse()
        );
    }
}
