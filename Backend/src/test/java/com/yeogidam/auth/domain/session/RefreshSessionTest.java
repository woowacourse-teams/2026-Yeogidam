package com.yeogidam.auth.domain.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class RefreshSessionTest {

    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");
    private static final Instant EXPIRES_AT = NOW.plus(Duration.ofDays(30));

    private final RefreshSession session = new RefreshSession(1L, "session-1", 7L, "hash-1", EXPIRES_AT, false);

    @Test
    void 폐기되지_않았고_회원이_같고_만료_전이면_재발급할_수_있다() {
        assertThat(session.canRefresh(7L, NOW)).isTrue();
    }

    @Test
    void 폐기됐거나_회원이_다르거나_만료됐으면_재발급할_수_없다() {
        assertAll(
                () -> assertThat(session.revoke().canRefresh(7L, NOW)).isFalse(),
                () -> assertThat(session.canRefresh(8L, NOW)).isFalse(),
                () -> assertThat(session.canRefresh(7L, EXPIRES_AT)).isFalse()
        );
    }

    @Test
    void 저장된_해시와_다른_토큰이면_불일치다() {
        assertAll(
                () -> assertThat(session.isTokenMismatch("hash-1")).isFalse(),
                () -> assertThat(session.isTokenMismatch("hash-2")).isTrue()
        );
    }

    @Test
    void 회전하면_해시만_바뀌고_세션_식별자와_만료는_그대로다() {
        // when
        RefreshSession rotated = session.rotate("hash-2");

        // then
        assertAll(
                () -> assertThat(rotated.getTokenHash()).isEqualTo("hash-2"),
                () -> assertThat(rotated.getSessionId()).isEqualTo("session-1"),
                () -> assertThat(rotated.getExpiresAt()).isEqualTo(EXPIRES_AT),
                () -> assertThat(rotated.isRevoked()).isFalse()
        );
    }

    @Test
    void 폐기하면_revoked만_참이_된다() {
        // when
        RefreshSession revoked = session.revoke();

        // then
        assertAll(
                () -> assertThat(revoked.isRevoked()).isTrue(),
                () -> assertThat(revoked.getTokenHash()).isEqualTo("hash-1"),
                () -> assertThat(revoked.isOwnedBy(7L)).isTrue()
        );
    }
}
