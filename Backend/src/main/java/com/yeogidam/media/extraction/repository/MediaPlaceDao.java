package com.yeogidam.media.extraction.repository;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class MediaPlaceDao {

    private static final RowMapper<Long> PLACE_ID_ROW_MAPPER = (resultSet, rowNumber) -> resultSet.getLong("place_id");

    private static final RowMapper<MediaPlaceProjection> PLACE_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new MediaPlaceProjection(
                    resultSet.getLong("place_id"),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address")
            );

    private final JdbcTemplate jdbcTemplate;

    public void saveIfAbsent(Long mediaId, Long placeId) {
        String sql = """
                INSERT INTO media_places (media_id, place_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """;
        jdbcTemplate.update(sql, mediaId, placeId);
    }

    public List<Long> findPlaceIds(Long mediaId) {
        String sql = """
                SELECT place_id
                FROM media_places
                WHERE media_id = ?
                ORDER BY id
                """;
        return jdbcTemplate.query(sql, PLACE_ID_ROW_MAPPER, mediaId);
    }

    public List<MediaPlaceProjection> findBySharedMediaId(Long sharedMediaId) {
        String sql = """
                SELECT p.id AS place_id,
                       p.thumbnail_key,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address
                FROM shared_media sm
                JOIN media_places mp ON mp.media_id = sm.media_id
                JOIN places p ON p.id = mp.place_id
                WHERE sm.id = ?
                ORDER BY mp.id
                """;
        return jdbcTemplate.query(sql, PLACE_PROJECTION_ROW_MAPPER, sharedMediaId);
    }
}
