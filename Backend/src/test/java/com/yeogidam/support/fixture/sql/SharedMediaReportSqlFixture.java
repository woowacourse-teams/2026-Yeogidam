package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * shared_media_reports 행을 DAO를 거치지 않고 직접 넣는다. 접수 시각은 Instant로 쓴다.
 */
public final class SharedMediaReportSqlFixture {

    private SharedMediaReportSqlFixture() {
    }

    public static void insertReport(
            JdbcTemplate jdbcTemplate,
            Long id,
            Long sharedMediaId,
            Instant createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media_reports (id, shared_media_id, created_at)
                VALUES (?, ?, ?)
                """, id, sharedMediaId, Timestamp.from(createdAt));
    }
}
