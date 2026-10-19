package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * refresh_sessions 행을 DAO를 거치지 않고 직접 넣는다. 만료 시각은 Instant로 쓴다.
 */
public final class RefreshSessionSqlFixture {

    private RefreshSessionSqlFixture() {
    }

    public static void insertRefreshSession(
            JdbcTemplate jdbcTemplate,
            Long refreshSessionId,
            String sessionId,
            Long memberId,
            String tokenHash,
            Instant expiresAt,
            boolean revoked
    ) {
        jdbcTemplate.update("""
                INSERT INTO refresh_sessions (id, session_id, member_id, token_hash, expires_at, revoked)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                refreshSessionId, sessionId, memberId, tokenHash,
                Timestamp.from(expiresAt), revoked
        );
    }
}
