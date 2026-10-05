package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;

@RequiredArgsConstructor
public final class SharedMediaReportSqlFixture {

    private final JdbcTemplate jdbcTemplate;

    public void insertReport(Long sharedMediaId, Instant createdAt) {
        jdbcTemplate.update("""
                INSERT INTO shared_media_reports (shared_media_id, created_at)
                VALUES (?, ?)
                """, sharedMediaId, Timestamp.from(createdAt));
    }

    public List<ReportState> reports() {
        return jdbcTemplate.query("""
                SELECT id, shared_media_id, created_at
                FROM shared_media_reports
                ORDER BY shared_media_id
                """, (resultSet, rowNumber) -> new ReportState(
                resultSet.getLong("id"),
                resultSet.getLong("shared_media_id"),
                resultSet.getTimestamp("created_at").toInstant()
        ));
    }

    public ExtractionState captureExtractionState() {
        return new ExtractionState(
                jdbcTemplate.queryForList("SELECT * FROM media ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media ORDER BY id")
        );
    }

    public record ReportState(Long id, Long sharedMediaId, Instant createdAt) {
    }

    public record ExtractionState(List<Map<String, Object>> media, List<Map<String, Object>> sharedMedia) {
    }
}
