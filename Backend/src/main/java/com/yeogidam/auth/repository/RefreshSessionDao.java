package com.yeogidam.auth.repository;

import com.yeogidam.auth.domain.session.RefreshSession;
import java.sql.Timestamp;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RefreshSessionDao {

    private static final RowMapper<RefreshSession> ROW_MAPPER = (resultSet, rowNumber) -> new RefreshSession(
            resultSet.getLong("id"),
            resultSet.getString("session_id"),
            resultSet.getLong("member_id"),
            resultSet.getString("token_hash"),
            resultSet.getTimestamp("expires_at").toInstant(),
            resultSet.getBoolean("revoked")
    );

    private final JdbcTemplate jdbcTemplate;

    public void save(RefreshSession session) {
        String sql = """
                INSERT INTO refresh_sessions (session_id, member_id, token_hash, expires_at, revoked)
                VALUES (?, ?, ?, ?, ?)
                """;
        jdbcTemplate.update(sql, session.getSessionId(), session.getMemberId(), session.getTokenHash(),
                Timestamp.from(session.getExpiresAt()), session.isRevoked());
    }

    public Optional<RefreshSession> findBySessionId(String sessionId) {
        String sql = """
                SELECT *
                FROM refresh_sessions
                WHERE session_id = ?
                FOR UPDATE
                """;
        return jdbcTemplate.query(sql, ROW_MAPPER, sessionId)
                .stream()
                .findFirst();
    }

    public void update(RefreshSession session) {
        String sql = """
                UPDATE refresh_sessions
                SET token_hash = ?,
                    revoked = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, session.getTokenHash(), session.isRevoked(), session.getId());
    }
}
