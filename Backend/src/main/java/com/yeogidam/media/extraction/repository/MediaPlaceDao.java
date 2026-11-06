package com.yeogidam.media.extraction.repository;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class MediaPlaceDao {

    private static final RowMapper<Long> PLACE_ID_ROW_MAPPER = (resultSet, rowNumber) -> resultSet.getLong("place_id");

    private static final RowMapper<ExtractedPlaceProjection> EXTRACTED_PLACE_ROW_MAPPER = (resultSet, rowNumber) ->
            new ExtractedPlaceProjection(
                    resultSet.getLong("place_id"),
                    resultSet.getString("kakao_place_id")
            );

    private static final RowMapper<MediaPlaceProjection> PLACE_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new MediaPlaceProjection(
                    resultSet.getLong("place_id"),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address")
            );

    private static final RowMapper<SavedMediaPlaceProjection> SAVED_MEDIA_PLACE_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedMediaPlaceProjection(
                    resultSet.getLong("media_id"),
                    resultSet.getLong("place_id"),
                    resultSet.getObject("saved_place_id", Long.class),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address"),
                    resultSet.getBigDecimal("latitude"),
                    resultSet.getBigDecimal("longitude"),
                    resultSet.getString("kakao_place_url"),
                    resultSet.getString("telephone")
            );

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedParameterJdbcTemplate;

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

    public ExtractedPlaceProjections findExtractedPlaces(Long mediaId) {
        String sql = """
                SELECT p.id AS place_id,
                       p.kakao_place_id
                FROM media_places mp
                JOIN places p ON p.id = mp.place_id
                WHERE mp.media_id = ?
                ORDER BY mp.id
                """;
        return new ExtractedPlaceProjections(jdbcTemplate.query(sql, EXTRACTED_PLACE_ROW_MAPPER, mediaId));
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

    /**
     * 고른 게시물들에서 추출된 장소를 추출 순서로 한 번에 읽고, 장소마다 회원의 보관함 항목 ID를 붙인다.
     * 보관함 항목은 회원 조건으로만 붙이므로 다른 회원이 저장한 장소는 null로 읽는다.
     * 게시물 ID가 없으면 IN절 문법 오류를 피하려고 조회하지 않는다.
     */
    public SavedMediaPlaceProjections findSavedMediaPlaces(Long memberId, List<Long> mediaIds) {
        if (mediaIds.isEmpty()) {
            return new SavedMediaPlaceProjections(List.of());
        }
        String sql = """
                SELECT mp.media_id,
                       p.id AS place_id,
                       sp.id AS saved_place_id,
                       p.thumbnail_key,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address,
                       p.latitude,
                       p.longitude,
                       p.kakao_place_url,
                       p.telephone
                FROM media_places mp
                JOIN places p ON p.id = mp.place_id
                LEFT JOIN saved_places sp ON sp.place_id = p.id
                                         AND sp.member_id = :memberId
                WHERE mp.media_id IN (:mediaIds)
                ORDER BY mp.id
                """;
        return new SavedMediaPlaceProjections(namedParameterJdbcTemplate.query(sql, Map.of(
                "memberId", memberId,
                "mediaIds", mediaIds
        ), SAVED_MEDIA_PLACE_ROW_MAPPER));
    }
}
