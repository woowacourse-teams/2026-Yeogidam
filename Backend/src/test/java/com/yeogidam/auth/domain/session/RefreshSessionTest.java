package com.yeogidam.auth.domain.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class RefreshSessionTest {

    private static final Long MEMBER_ID = 1L;
    private static final Instant EXPIRES_AT = Instant.parse("2026-10-01T00:00:00Z");

    @Test
    void 폐기되지_않고_회원과_만료일이_유효하면_재발급할_수_있다() {
        // given
        RefreshSession session = new RefreshSession("session", MEMBER_ID, "hash", EXPIRES_AT, false);

        // when
        boolean canRefresh = session.canRefresh(MEMBER_ID, EXPIRES_AT.minusSeconds(1));

        // then
        assertThat(canRefresh).isTrue();
    }

    @Test
    void 폐기되었거나_회원이_다르거나_만료되면_재발급할_수_없다() {
        // given
        RefreshSession revoked = new RefreshSession("session-1", MEMBER_ID, "hash", EXPIRES_AT, true);
        RefreshSession anotherMember = new RefreshSession("session-2", MEMBER_ID, "hash", EXPIRES_AT, false);
        RefreshSession expired = new RefreshSession("session-3", MEMBER_ID, "hash", EXPIRES_AT, false);

        // when & then
        assertAll(
                () -> assertThat(revoked.canRefresh(MEMBER_ID, EXPIRES_AT.minusSeconds(1)))
                        .isFalse(),
                () -> assertThat(anotherMember.canRefresh(2L, EXPIRES_AT.minusSeconds(1)))
                        .isFalse(),
                () -> assertThat(expired.canRefresh(MEMBER_ID, EXPIRES_AT))
                        .isFalse()
        );
    }

    @Test
    void 토큰이_다르면_재사용으로_판단한다() {
        // given
        RefreshSession session = new RefreshSession("session", MEMBER_ID, "stored-hash", EXPIRES_AT, false);

        // when & then
        assertThat(session.isTokenMismatch("other-hash"))
                .isTrue();
    }

    @Test
    void 토큰을_교체하거나_세션을_폐기해도_기존_식별자와_만료일은_유지한다() {
        // given
        RefreshSession session = new RefreshSession("session", MEMBER_ID, "old-hash", EXPIRES_AT, false);

        // when
        RefreshSession rotated = session.rotate("new-hash");
        RefreshSession revoked = rotated.revoke();

        // then
        assertAll(
                () -> assertThat(rotated.getSessionId())
                        .isEqualTo(session.getSessionId()),
                () -> assertThat(rotated.getMemberId())
                        .isEqualTo(session.getMemberId()),
                () -> assertThat(rotated.getExpiresAt())
                        .isEqualTo(session.getExpiresAt()),
                () -> assertThat(rotated.getTokenHash())
                        .isEqualTo("new-hash"),
                () -> assertThat(revoked.isRevoked())
                        .isTrue()
        );
    }
}
