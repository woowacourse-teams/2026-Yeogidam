package com.yeogidam.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.fixture.MutableClock;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RotatedRefreshTokensTest {

    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");
    private static final String SESSION_ID = "session-1";

    private final MutableClock clock = new MutableClock(NOW);
    private final RotatedRefreshTokens rotatedRefreshTokens = new RotatedRefreshTokens(clock);

    @Test
    void 같은_세션을_다시_기록하면_직전_토큰만_남는다() {
        // given
        rotatedRefreshTokens.record(SESSION_ID, "hash-1");
        rotatedRefreshTokens.record(SESSION_ID, "hash-2");

        // when & then
        assertAll(
                () -> assertThat(rotatedRefreshTokens.isInGracePeriod(SESSION_ID, "hash-1")).isFalse(),
                () -> assertThat(rotatedRefreshTokens.isInGracePeriod(SESSION_ID, "hash-2")).isTrue()
        );
    }

    @Test
    void 기록이_없는_세션은_유예하지_않는다() {
        // when & then
        assertThat(rotatedRefreshTokens.isInGracePeriod("session-2", "hash-1")).isFalse();
    }
}
