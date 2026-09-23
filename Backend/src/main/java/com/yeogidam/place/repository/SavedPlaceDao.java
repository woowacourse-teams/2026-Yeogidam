package com.yeogidam.place.repository;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
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

    private static final RowMapper<SavedPlaceMediaProjection> MEDIA_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceMediaProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("media_id"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("author"),
                    resultSet.getString("caption"),
                    resultSet.getString("shared_url"),
                    resultSet.getObject("created_at", LocalDateTime.class)
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
    /**
     * 회원의 보관함 항목인지 본다. 없는 항목이거나 남의 항목이면 false다.
     */
    public boolean existsByMemberAndId(Long memberId, Long savedPlaceId) {
        String sql = """
                SELECT EXISTS(
                    SELECT 1
                    FROM saved_places
                    WHERE member_id = ?
                      AND id = ?
                )
                """;
        return jdbcTemplate.queryForObject(sql, Boolean.class, memberId, savedPlaceId);
    }

    /**
     * 보관함 행 하나에 연결된 공유를 전부 읽는다. 연결 행 하나가 결과 한 행이라 행이 늘지 않는다.
     * 릴스당 최신 공유 한 건만 남기는 규칙과 정렬은 SavedPlaceMediaProjections가 맡는다.
     */
    public SavedPlaceMediaProjections findMediaBySavedPlace(Long savedPlaceId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.media_id,
                       m.thumbnail_url,
                       m.author,
                       m.caption,
                       sm.shared_url,
                       sm.created_at
                FROM shared_media_saved_places l
                JOIN shared_media sm ON sm.id = l.shared_media_id
                JOIN media m ON m.id = sm.media_id
                WHERE l.saved_place_id = ?
                """;
        return new SavedPlaceMediaProjections(jdbcTemplate.query(sql, MEDIA_PROJECTION_ROW_MAPPER, savedPlaceId));
    }

    /**
     * 회원의 보관함에서 고른 항목(saved_places.id)을 한 번에 뺀다. 없는 항목이나 남의 항목은 member_id 조건에 걸려 그냥 지워지지 않는다.
     * 어느 공유에서 저장했는지 연결(shared_media_saved_places)은 FK의 ON DELETE CASCADE가 함께 지운다.
     */
    public int deleteByMemberAndIds(Long memberId, List<Long> savedPlaceIds) {
        String placeholders = savedPlaceIds.stream()
                .map(savedPlaceId -> "?")
                .collect(Collectors.joining(", "));
        String sql = """
                DELETE FROM saved_places
                WHERE member_id = ?
                  AND id IN (%s)
                """.formatted(placeholders);
        List<Object> arguments = new ArrayList<>();
        arguments.add(memberId);
        arguments.addAll(savedPlaceIds);
        return jdbcTemplate.update(sql, arguments.toArray());
    }
}
