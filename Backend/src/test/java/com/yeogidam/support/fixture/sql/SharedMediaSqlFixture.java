package com.yeogidam.support.fixture.sql;

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
                INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId,
                "https://www.instagram.com/reel/fixture-" + sharedMediaId + "/", Timestamp.from(createdAt));
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
                INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId, sharedUrl, Timestamp.from(createdAt));
    }
}
