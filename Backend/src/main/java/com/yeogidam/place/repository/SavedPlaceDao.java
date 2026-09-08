package com.yeogidam.place.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * saved_place(보관함)와 saved_place_share(저장 경로 연결) 행.
 * 회원과 장소당 한 행은 UNIQUE 제약이 보장하고, 재저장은 last_saved_at 갱신으로 흡수된다.
 */
@Repository
public class SavedPlaceDao {

    private static final RowMapper<SavedPlaceRecord> ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceRecord(
                    resultSet.getLong("id"),
                    resultSet.getLong("member_id"),
                    resultSet.getLong("place_id"),
                    resultSet.getTimestamp("first_saved_at").toLocalDateTime(),
                    resultSet.getTimestamp("last_saved_at").toLocalDateTime());

    private static final RowMapper<SavedPlaceView> VIEW_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceView(
                    resultSet.getLong("id"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("address"),
                    resultSet.getString("road_address"),
                    resultSet.getBigDecimal("latitude"),
                    resultSet.getBigDecimal("longitude"),
                    resultSet.getString("kakao_place_url"),
                    resultSet.getString("telephone"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getInt("media_count"));

    private final JdbcTemplate jdbcTemplate;

    public SavedPlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(
            Long memberId,
            Long placeId,
            LocalDateTime savedAt
    ) {
        String sql = """
                INSERT INTO saved_place (member_id, place_id, first_saved_at, last_saved_at)
                VALUES (?, ?, ?, ?)
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            var statement = connection.prepareStatement(sql, new String[]{"id"});
            statement.setLong(1, memberId);
            statement.setLong(2, placeId);
            statement.setObject(3, savedAt);
            statement.setObject(4, savedAt);
            return statement;
        }, keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    public Optional<SavedPlaceRecord> findByMemberAndPlace(
            Long memberId,
            Long placeId
    ) {
        String sql = "SELECT * FROM saved_place WHERE member_id = ? AND place_id = ?";
        return jdbcTemplate.query(sql, ROW_MAPPER, memberId, placeId).stream()
                .findFirst();
    }

    public void updateLastSavedAt(
            Long id,
            LocalDateTime lastSavedAt
    ) {
        String sql = "UPDATE saved_place SET last_saved_at = ? WHERE id = ?";
        jdbcTemplate.update(sql, lastSavedAt, id);
    }

    /**
     * 같은 공유에서 같은 장소를 다시 잇는 요청은 유니크 위반을 삼켜 멱등으로 만든다.
     */
    public void linkShare(
            Long savedPlaceId,
            Long shareId
    ) {
        String sql = "INSERT INTO saved_place_share (saved_place_id, share_id) VALUES (?, ?)";
        try {
            jdbcTemplate.update(sql, savedPlaceId, shareId);
        } catch (DuplicateKeyException ignored) {
        }
    }

    public List<SavedPlaceView> findAllViewsByMemberId(Long memberId) {
        String sql = """
                SELECT p.id, p.name, p.category, p.address, p.road_address,
                       p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url,
                       COUNT(DISTINCT ms.media_id) AS media_count
                FROM saved_place AS sp
                INNER JOIN place AS p
                  ON p.id = sp.place_id
                LEFT JOIN saved_place_share AS link
                  ON link.saved_place_id = sp.id
                LEFT JOIN media_share AS ms
                  ON ms.id = link.share_id
                WHERE sp.member_id = ?
                GROUP BY p.id, p.name, p.category, p.address, p.road_address,
                         p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url
                ORDER BY p.id
                """;
        return jdbcTemplate.query(sql, VIEW_ROW_MAPPER, memberId);
    }

    public boolean existsByMemberAndPlace(
            Long memberId,
            Long placeId
    ) {
        String sql = "SELECT COUNT(*) FROM saved_place WHERE member_id = ? AND place_id = ?";
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, memberId, placeId);
        return count != null && count > 0;
    }

    /**
     * 보관함 행과 연결만 지운다. share_place의 SAVED 이력은 그 공유에서 저장했다는 사실이라 남긴다.
     */
    public void deleteByMemberAndPlace(
            Long memberId,
            Long placeId
    ) {
        String deleteLinks = """
                DELETE FROM saved_place_share
                WHERE saved_place_id IN (SELECT id FROM saved_place WHERE member_id = ? AND place_id = ?)
                """;
        jdbcTemplate.update(deleteLinks, memberId, placeId);
        jdbcTemplate.update("DELETE FROM saved_place WHERE member_id = ? AND place_id = ?", memberId, placeId);
    }
}
