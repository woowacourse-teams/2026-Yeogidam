package com.yeogidam.media.share.repository;

import java.util.List;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class PlaceCandidateDao {

    private static final RowMapper<SharedMediaProjection> SHARED_MEDIA_ROW_MAPPER = (resultSet, rowNumber) ->
            new SharedMediaProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("shared_at").toInstant(),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("caption"),
                    resultSet.getString("author")
            );

    private static final RowMapper<PlaceCandidateProjection> PLACE_CANDIDATE_ROW_MAPPER = (resultSet, rowNumber) ->
            new PlaceCandidateProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getLong("candidate_id"),
                    resultSet.getLong("place_id"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("land_lot_address"),
                    resultSet.getString("road_address")
            );

    private final JdbcTemplate jdbcTemplate;

    public PlaceCandidateDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<SharedMediaProjection> findSharedMedias(Long memberId) {
        String sql = """
                SELECT sm.id AS shared_media_id,
                       sm.created_at AS shared_at,
                       m.thumbnail_url,
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
                       p.thumbnail_url,
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
                       p.thumbnail_url,
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
