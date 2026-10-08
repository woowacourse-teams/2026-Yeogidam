package com.yeogidam.support.fixture.sql;

import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

public final class SharedMediaSqlFixture {

    private SharedMediaSqlFixture() {
    }

    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            Instant createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media (
                    id, member_id, media_id, shared_url, created_at,
                    extraction_status, failure_reason, extraction_version
                )
                SELECT ?, ?, m.id, ?, ?, m.extraction_status, m.failure_reason, m.extraction_version
                FROM media m
                WHERE m.id = ?
                """, sharedMediaId, memberId,
                "https://www.instagram.com/reel/fixture-" + sharedMediaId + "/",
                Timestamp.from(createdAt), mediaId);
    }

    /**
     * 공유 URL을 직접 정하는 판. 위 판은 식별자로 URL을 만든다.
     */
    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            String sharedUrl,
            Instant createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media (
                    id, member_id, media_id, shared_url, created_at,
                    extraction_status, failure_reason, extraction_version
                )
                SELECT ?, ?, m.id, ?, ?, m.extraction_status, m.failure_reason, m.extraction_version
                FROM media m
                WHERE m.id = ?
                """, sharedMediaId, memberId, sharedUrl, Timestamp.from(createdAt), mediaId);
    }

    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            Instant createdAt,
            ExtractionSnapshot snapshot
    ) {
        String failureReason = null;
        if (snapshot.failureReason() != null) {
            failureReason = snapshot.failureReason().name();
        }
        jdbcTemplate.update("""
                INSERT INTO shared_media (
                    id, member_id, media_id, shared_url, created_at,
                    extraction_status, failure_reason, extraction_version
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId,
                "https://www.instagram.com/reel/fixture-" + sharedMediaId + "/", Timestamp.from(createdAt),
                snapshot.status().name(), failureReason, snapshot.version());
    }
}
