package com.yeogidam.place.repository;

import com.yeogidam.place.domain.SavedPlace;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SavedPlaceDao {

    private static final RowMapper<SavedPlaceProjection> PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceProjection(
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
                    resultSet.getTimestamp("last_saved_at").toInstant()
            );

    private static final RowMapper<SavedPlaceFolderProjection> FOLDER_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceFolderProjection(
                    resultSet.getLong("saved_place_id"),
                    resultSet.getLong("folder_id")
            );

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

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedParameterJdbcTemplate;

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

    /**
     * 저장(saveOrUpdate)한 보관함 항목의 ID를 잠금 조회로 읽는다.
     * REPEATABLE READ의 일반 조회는 트랜잭션 스냅숏을 읽어서, 다른 트랜잭션이 지우고 커밋한 옛 ID까지 돌려줄 수 있다.
     * 옛 ID로 공유 연결을 넣으면 외래 키에 걸리므로, 잠금 조회로 지금 남은 항목의 ID만 읽는다.
     */
    public Long getIdByMemberAndPlaceForUpdate(Long memberId, Long placeId) {
        String sql = """
                SELECT id
                FROM saved_places
                WHERE member_id = ?
                  AND place_id = ?
                FOR UPDATE
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
        return jdbcTemplate.query(sql, PROJECTION_ROW_MAPPER, memberId);
    }

    /**
     * 회원의 폴더와 보관함 항목이 연결된 행을 담은 시각 오름차순으로 읽고, 같은 시각이면 연결 ID 오름차순으로 읽는다.
     * 보관함 항목별로 묶는 일은 SavedPlaceFolderProjections가 맡는다.
     */
    public SavedPlaceFolderProjections findFolderLinksByMember(Long memberId) {
        String sql = """
                SELECT fsp.saved_place_id, fsp.folder_id
                FROM folder_saved_places fsp
                JOIN folders f ON f.id = fsp.folder_id
                JOIN saved_places sp ON sp.id = fsp.saved_place_id
                WHERE f.member_id = ?
                  AND sp.member_id = ?
                ORDER BY fsp.created_at ASC, fsp.id ASC
                """;
        return new SavedPlaceFolderProjections(
                jdbcTemplate.query(sql, FOLDER_PROJECTION_ROW_MAPPER, memberId, memberId)
        );
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
     * 보관함 항목 하나에 연결된 공유 가운데 지우지 않은 공유를 전부 읽는다. 연결 하나가 결과 하나라 결과가 늘지 않는다.
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
                  AND sm.deleted_at IS NULL
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

    /**
     * 회원이 고른 게시물(mediaIds)의 공유에서 저장한 보관함 항목의 장소 ID를 중복 없이 읽는다. 이미 지운 공유의 연결도 함께 읽는다.
     */
    public List<Long> findPlaceIdsByMemberAndMediaIds(Long memberId, List<Long> mediaIds) {
        String sql = """
                SELECT DISTINCT sp.place_id
                FROM shared_media_saved_places l
                JOIN shared_media sm ON sm.id = l.shared_media_id
                JOIN saved_places sp ON sp.id = l.saved_place_id
                WHERE sm.member_id = :memberId
                  AND sm.media_id IN (:mediaIds)
                ORDER BY sp.place_id
                """;
        return namedParameterJdbcTemplate.queryForList(sql, Map.of(
                "memberId", memberId,
                "mediaIds", mediaIds
        ), Long.class);
    }

    /**
     * 회원의 보관함 항목을 (member_id, place_id) 유니크 인덱스로 장소 ID 순서대로 잠근다.
     * 공유와 추출 완료의 저장(saveOrUpdate)도 같은 인덱스부터 잠그므로 잠그는 순서가 엇갈리지 않는다.
     * 공유 연결을 넣으려면 외래 키 확인으로 항목 레코드에 공유 락이 필요해서, 잠근 동안에는 다른 트랜잭션이 연결을 더하지 못한다.
     */
    public void lockByMemberAndPlaceIds(Long memberId, List<Long> placeIds) {
        String sql = """
                SELECT id
                FROM saved_places
                WHERE member_id = :memberId
                  AND place_id IN (:placeIds)
                ORDER BY place_id
                FOR UPDATE
                """;
        namedParameterJdbcTemplate.queryForList(sql, Map.of(
                "memberId", memberId,
                "placeIds", placeIds
        ), Long.class);
    }

    /**
     * 회원의 보관함 항목 가운데 지우지 않은 공유와 연결이 없는 항목의 ID를 읽는다. 폴더에 담긴 항목도 읽는다.
     * 잠금 없는 일반 SELECT라서 다른 공유 레코드에 공유 락을 남기지 않는다.
     */
    public List<Long> findUnlinkedIdsByMemberAndPlaceIds(Long memberId, List<Long> placeIds) {
        String sql = """
                SELECT sp.id
                FROM saved_places sp
                WHERE sp.member_id = :memberId
                  AND sp.place_id IN (:placeIds)
                  AND NOT EXISTS (
                      SELECT 1
                      FROM shared_media_saved_places l
                      JOIN shared_media sm ON sm.id = l.shared_media_id
                      WHERE l.saved_place_id = sp.id
                        AND sm.deleted_at IS NULL
                  )
                ORDER BY sp.id
                """;
        return namedParameterJdbcTemplate.queryForList(sql, Map.of(
                "memberId", memberId,
                "placeIds", placeIds
        ), Long.class);
    }
}
