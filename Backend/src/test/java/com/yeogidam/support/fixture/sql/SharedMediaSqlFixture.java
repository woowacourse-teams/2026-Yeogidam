package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.JdbcTemplate;

public final class SharedMediaSqlFixture {

    private SharedMediaSqlFixture() {
    }

    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            Timestamp createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId,
                "https://www.instagram.com/reel/fixture-" + sharedMediaId + "/", createdAt);
    }

    /**
     * 공유 URL과 시각을 직접 정하는 판. 시각은 DAO와 같은 규칙(UTC LocalDateTime)으로 넣어 읽은 값과 같아진다.
     */
    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            String sharedUrl,
            Instant sharedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId, sharedUrl, LocalDateTime.ofInstant(sharedAt, ZoneOffset.UTC));
    }
}
