package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;

public final class SharedMediaSqlFixture {

    private SharedMediaSqlFixture() {
    }

    public static void createSharedMedia(
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
}
