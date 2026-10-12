package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * media_places(릴스에서 추출한 장소 연결) 행을 직접 넣는다.
 */
public final class MediaPlaceSqlFixture {

    private MediaPlaceSqlFixture() {
    }

    public static void insertMediaPlace(JdbcTemplate jdbcTemplate, Long id, Long mediaId, Long placeId) {
        jdbcTemplate.update("""
                INSERT INTO media_places (id, media_id, place_id)
                VALUES (?, ?, ?)
                """, id, mediaId, placeId);
    }
}
