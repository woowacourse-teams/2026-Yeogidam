package com.yeogidam.place.repository;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SavedPlaceDao {

    private static final RowMapper<SavedPlaceProjection> PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceProjection(
                    resultSet.getLong("saved_place_id"),
                    resultSet.getLong("place_id"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address"),
                    resultSet.getBigDecimal("latitude"),
                    resultSet.getBigDecimal("longitude"),
                    resultSet.getString("kakao_place_url"),
                    resultSet.getString("telephone"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("thumbnail_source"),
                    resultSet.getString("thumbnail_attribution"),
                    resultSet.getObject("last_saved_at", LocalDateTime.class)
                            .toInstant(ZoneOffset.UTC)
            );

    private final JdbcTemplate jdbcTemplate;

    /**
     * 회원의 보관함 전량을 최근 저장 순으로 읽는다.
     */
    public List<SavedPlaceProjection> findAllByMember(Long memberId) {
        String sql = """
                SELECT sp.id AS saved_place_id,
                       p.id AS place_id,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address,
                       p.latitude,
                       p.longitude,
                       p.kakao_place_url,
                       p.telephone,
                       p.thumbnail_url,
                       p.thumbnail_source,
                       p.thumbnail_attribution,
                       sp.last_saved_at
                FROM saved_places sp
                JOIN places p ON p.id = sp.place_id
                WHERE sp.member_id = ?
                ORDER BY sp.last_saved_at DESC
                """;
        return jdbcTemplate.query(sql, PROJECTION_ROW_MAPPER, memberId);
    }

    /**
     * 회원의 보관함에서 항목(saved_places.id)을 뺀다. 지운 행 수를 돌려주므로 0이면 없는 항목이거나 남의 항목이다.
     * 어느 공유에서 저장했는지 연결(shared_media_saved_places)은 FK의 ON DELETE CASCADE가 함께 지운다.
     */
    public int deleteByMemberAndId(Long memberId, Long savedPlaceId) {
        String sql = """
                DELETE FROM saved_places
                WHERE member_id = ?
                  AND id = ?
                """;
        return jdbcTemplate.update(sql, memberId, savedPlaceId);
    }
}
