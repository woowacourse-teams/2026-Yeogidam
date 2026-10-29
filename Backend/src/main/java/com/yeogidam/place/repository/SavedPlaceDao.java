package com.yeogidam.place.repository;

import com.yeogidam.place.domain.SavedPlace;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SavedPlaceDao {

    private static final RowMapper<SavedPlaceMediaProjection> MEDIA_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceMediaProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("media_id"),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("author"),
                    resultSet.getString("caption"),
                    resultSet.getString("shared_url"),
                    resultSet.getTimestamp("created_at").toInstant()
            );

    private static RowMapper<SavedPlaceProjection> createProjectionRowMapper(Map<Long, List<Long>> folderIdsBySavedPlace) {
        return (resultSet, rowNumber) -> new SavedPlaceProjection(
                resultSet.getLong("id"),
                resultSet.getLong("place_id"),
                resultSet.getString("name"),
                resultSet.getString("category"),
                resultSet.getString("land_lot_address"),
                resultSet.getString("road_address"),
                resultSet.getBigDecimal("latitude"),
                resultSet.getBigDecimal("longitude"),
                resultSet.getString("kakao_place_url"),
                resultSet.getString("telephone"),
                resultSet.getString("thumbnail_key"),
                resultSet.getString("thumbnail_source"),
                resultSet.getTimestamp("last_saved_at").toInstant(),
                folderIdsBySavedPlace.getOrDefault(resultSet.getLong("id"), List.of())
        );
    }

    private final JdbcTemplate jdbcTemplate;

    public void saveOrUpdate(SavedPlace savedPlace) {
        String sql = """
                INSERT INTO saved_places (member_id, place_id, last_saved_at)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE last_saved_at = VALUES(last_saved_at)
                """;
        jdbcTemplate.update(
                sql,
                savedPlace.getMemberId(),
                savedPlace.getPlaceId(),
                Timestamp.from(savedPlace.getLastSavedAt())
        );
    }

    public Long getIdByMemberAndPlace(Long memberId, Long placeId) {
        String sql = """
                SELECT id
                FROM saved_places
                WHERE member_id = ?
                  AND place_id = ?
                """;
        return jdbcTemplate.queryForObject(sql, Long.class, memberId, placeId);
    }

    public void saveShareIfAbsent(
            Long savedPlaceId,
            Long sharedMediaId,
            Instant savedAt
    ) {
        String sql = """
                INSERT INTO shared_media_saved_places (saved_place_id, shared_media_id, created_at)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """;
        jdbcTemplate.update(sql, savedPlaceId, sharedMediaId, Timestamp.from(savedAt));
    }

    /**
     * 회원의 보관함 전량을 최근 저장 순으로 읽는다.
     */
    public List<SavedPlaceProjection> findAllByMember(Long memberId) {
        Map<Long, List<Long>> folderIdsBySavedPlace = findFolderIdsByMember(memberId);
        String sql = """
                SELECT sp.id,
                       p.id AS place_id,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address,
                       p.latitude,
                       p.longitude,
                       p.kakao_place_url,
                       p.telephone,
                       p.thumbnail_key,
                       p.thumbnail_source,
                       sp.last_saved_at
                FROM saved_places sp
                JOIN places p ON p.id = sp.place_id
                WHERE sp.member_id = ?
                ORDER BY sp.last_saved_at DESC
                """;
        return jdbcTemplate.query(sql, createProjectionRowMapper(folderIdsBySavedPlace), memberId);
    }

    private Map<Long, List<Long>> findFolderIdsByMember(Long memberId) {
        String sql = """
                SELECT fsp.saved_place_id, fsp.folder_id
                FROM folder_saved_places fsp
                JOIN folders f ON f.id = fsp.folder_id
                JOIN saved_places sp ON sp.id = fsp.saved_place_id
                WHERE f.member_id = ?
                  AND sp.member_id = ?
                ORDER BY fsp.created_at ASC, fsp.id ASC
                """;
        Map<Long, List<Long>> folderIdsBySavedPlace = new HashMap<>();
        jdbcTemplate.query(sql, resultSet -> {
            Long savedPlaceId = resultSet.getLong("saved_place_id");
            Long folderId = resultSet.getLong("folder_id");
            folderIdsBySavedPlace.computeIfAbsent(savedPlaceId, ignored -> new ArrayList<>()).add(folderId);
        }, memberId, memberId);
        return folderIdsBySavedPlace;
    }

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
                       m.thumbnail_key,
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
