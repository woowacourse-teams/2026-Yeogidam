package com.yeogidam.media.extraction.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class MediaPlaceDao {

    private final JdbcTemplate jdbcTemplate;

    public void saveIfAbsent(Long mediaId, Long placeId) {
        String sql = """
                INSERT INTO media_places (media_id, place_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """;
        jdbcTemplate.update(sql, mediaId, placeId);
    }
}
