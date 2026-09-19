package com.yeogidam.auth.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.domain.session.RefreshSession;
import com.yeogidam.support.JdbcTestSupport;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

/**
 * DB 쿼리와 매핑이 실제 MySQL에서 동작하는지 검증한다. 읽기 검증은 SQL fixture로 행을 심는다.
 */
@Import(RefreshSessionDao.class)
class RefreshSessionDaoTest extends JdbcTestSupport {

    private static final Instant EXPIRES_AT = Instant.parse("2026-10-15T00:00:00Z");
    private static final String INSERT_MEMBER_AND_SESSION_SQL = """
            INSERT INTO members (id, oauth_provider, provider_user_id, nickname)
            VALUES (1, 'KAKAO', 'kakao-1', '빈');
            INSERT INTO refresh_sessions (id, session_id, member_id, token_hash, expires_at, revoked)
            VALUES (10, 'session-1', 1, 'hash-1', '2026-10-15 00:00:00', FALSE);
            """;

    @Autowired
    private RefreshSessionDao refreshSessionDao;

    @Test
    @Sql(statements = INSERT_MEMBER_AND_SESSION_SQL)
    void 세션_식별자로_읽으면_모든_열이_매핑되고_만료는_UTC로_읽는다() {
        // when
        RefreshSession session = refreshSessionDao.findBySessionId("session-1").orElseThrow();

        // then
        assertAll(
                () -> assertThat(session.getId()).isEqualTo(10L),
                () -> assertThat(session.getMemberId()).isEqualTo(1L),
                () -> assertThat(session.getTokenHash()).isEqualTo("hash-1"),
                () -> assertThat(session.getExpiresAt()).isEqualTo(EXPIRES_AT),
                () -> assertThat(session.isRevoked()).isFalse()
        );
    }

    @Test
    @Sql(statements = INSERT_MEMBER_AND_SESSION_SQL)
    void 저장한_세션은_같은_만료_시각으로_다시_읽힌다() {
        // given
        Instant expiresAt = Instant.parse("2026-11-01T12:34:56Z");

        // when
        refreshSessionDao.save(new RefreshSession("session-2", 1L, "hash-2", expiresAt, false));

        // then
        RefreshSession saved = refreshSessionDao.findBySessionId("session-2").orElseThrow();
        assertAll(
                () -> assertThat(saved.getId()).isNotNull(),
                () -> assertThat(saved.getExpiresAt()).isEqualTo(expiresAt)
        );
    }

    @Test
    @Sql(statements = INSERT_MEMBER_AND_SESSION_SQL)
    void 갱신하면_해시와_폐기_여부만_바뀐다() {
        // given
        RefreshSession session = refreshSessionDao.findBySessionId("session-1").orElseThrow();

        // when
        refreshSessionDao.update(session.rotate("hash-9").revoke());

        // then
        RefreshSession updated = refreshSessionDao.findBySessionId("session-1").orElseThrow();
        assertAll(
                () -> assertThat(updated.getTokenHash()).isEqualTo("hash-9"),
                () -> assertThat(updated.isRevoked()).isTrue(),
                () -> assertThat(updated.getExpiresAt()).isEqualTo(EXPIRES_AT)
        );
    }

    @Test
    void 없는_세션은_빈_값이다() {
        assertThat(refreshSessionDao.findBySessionId("nope")).isEmpty();
    }
}
