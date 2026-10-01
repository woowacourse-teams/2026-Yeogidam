package com.yeogidam.media.share.repository;

import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PlaceCandidateDao {

    private static final RowMapper<SharedMediaSummaryProjection> SHARED_MEDIA_ROW_MAPPER = (resultSet, rowNumber) ->
            new SharedMediaSummaryProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("caption"),
                    resultSet.getString("author")
            );

    private static final RowMapper<PlaceCandidateProjection> PLACE_CANDIDATE_ROW_MAPPER = (resultSet, rowNumber) ->
            new PlaceCandidateProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("candidate_id"),
                    resultSet.getLong("place_id"),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address")
            );

    private final JdbcTemplate jdbcTemplate;

    public void supersedeUndecided(Long memberId, Long mediaId) {
        String sql = """
                UPDATE place_candidates pc
                JOIN shared_media sm ON sm.id = pc.shared_media_id
                SET pc.decision_status = 'SUPERSEDED'
                WHERE sm.member_id = ?
                  AND sm.media_id = ?
                  AND pc.decision_status = 'UNDECIDED'
                """;
        jdbcTemplate.update(sql, memberId, mediaId);
    }

    public void issueForShare(Long sharedMediaId, Long mediaId) {
        String sql = """
                INSERT INTO place_candidates (shared_media_id, place_id, decision_status)
                SELECT ?, mp.place_id, 'UNDECIDED'
                FROM media_places mp
                WHERE mp.media_id = ?
                """;
        jdbcTemplate.update(sql, sharedMediaId, mediaId);
    }

    public void issueForLatestShares(Long mediaId) {
        String sql = """
                INSERT INTO place_candidates (shared_media_id, place_id, decision_status)
                SELECT sm.id, mp.place_id, 'UNDECIDED'
                FROM shared_media sm
                JOIN media_places mp ON mp.media_id = sm.media_id
                WHERE sm.media_id = ?
                  AND NOT EXISTS (
                      SELECT 1 FROM shared_media newer
                      WHERE newer.member_id = sm.member_id
                        AND newer.media_id = sm.media_id
                        AND newer.id > sm.id
                  )
                """;
        jdbcTemplate.update(sql, mediaId);
    }

    public List<SharedMediaSummaryProjection> findSharedMedias(Long memberId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at,
                       m.thumbnail_key,
                       m.caption,
                       m.author
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM place_candidates pc
                      WHERE pc.shared_media_id = sm.id
                        AND pc.decision_status = 'UNDECIDED'
                  )
                ORDER BY sm.created_at DESC, sm.id DESC
                """;
        return jdbcTemplate.query(sql, SHARED_MEDIA_ROW_MAPPER, memberId);
    }

    public List<PlaceCandidateProjection> findUndecidedCandidates(List<Long> sharedMediaIds) {
        if (sharedMediaIds.isEmpty()) {
            return List.of();
        }
        String placeholders = sharedMediaIds.stream()
                .map(sharedMediaId -> "?")
                .collect(Collectors.joining(", "));
        String sql = """
                SELECT pc.shared_media_id,
                       pc.id AS candidate_id,
                       p.id AS place_id,
                       p.thumbnail_key,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address
                FROM place_candidates pc
                JOIN places p ON p.id = pc.place_id
                WHERE pc.shared_media_id IN (%s)
                  AND pc.decision_status = 'UNDECIDED'
                ORDER BY pc.shared_media_id ASC, pc.id ASC
                """.formatted(placeholders);
        return jdbcTemplate.query(sql, PLACE_CANDIDATE_ROW_MAPPER, sharedMediaIds.toArray());
    }

    public List<PlaceCandidateProjection> findCandidates(Long sharedMediaId) {
        String sql = """
                SELECT pc.shared_media_id,
                       pc.id AS candidate_id,
                       p.id AS place_id,
                       p.thumbnail_key,
                       p.name,
                       p.category,
                       p.land_lot_address,
                       p.road_address
                FROM place_candidates pc
                JOIN places p ON p.id = pc.place_id
                WHERE pc.shared_media_id = ?
                ORDER BY pc.id ASC
                """;
        return jdbcTemplate.query(sql, PLACE_CANDIDATE_ROW_MAPPER, sharedMediaId);
    }
}
