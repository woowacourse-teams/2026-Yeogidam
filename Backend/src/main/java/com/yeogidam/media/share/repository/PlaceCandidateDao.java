package com.yeogidam.media.share.repository;

import com.yeogidam.media.share.domain.PlaceCandidate;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PlaceCandidateDao {

    private static final RowMapper<PlaceCandidate> CANDIDATE_ROW_MAPPER = (resultSet, rowNumber) ->
            new PlaceCandidate(
                    new Place(
                            resultSet.getLong("place_id"),
                            new PlaceExternalSource(resultSet.getString("kakao_place_id"),
                                    resultSet.getString("kakao_place_url")),
                            new PlaceProfile(
                                    new PlaceName(resultSet.getString("name")),
                                    new Address(resultSet.getString("land_lot_address"),
                                            resultSet.getString("road_address")),
                                    new Coordinate(resultSet.getBigDecimal("latitude"),
                                            resultSet.getBigDecimal("longitude")),
                                    resultSet.getString("category"),
                                    resultSet.getString("telephone"),
                                    new PlaceThumbnail(resultSet.getString("thumbnail_key"),
                                            resultSet.getString("thumbnail_source"))
                            )
                    ),
                    PlaceDecisionStatus.valueOf(resultSet.getString("decision_status"))
            );

    private static final RowMapper<SharedMediaSummaryProjection> SHARED_MEDIA_ROW_MAPPER = (resultSet, rowNumber) ->
            new SharedMediaSummaryProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getTimestamp("created_at").toInstant(),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("caption"),
                    resultSet.getString("author")
            );

    private static final RowMapper<PlaceCandidateProjection> PLACE_CANDIDATE_PROJECTION_ROW_MAPPER =
            (resultSet, rowNumber) -> new PlaceCandidateProjection(
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

    public List<PlaceCandidate> findAllBySharedMediaId(Long sharedMediaId) {
        String sql = """
                SELECT pc.place_id,
                       pc.decision_status,
                       p.kakao_place_id,
                       p.kakao_place_url,
                       p.name,
                       p.land_lot_address,
                       p.road_address,
                       p.latitude,
                       p.longitude,
                       p.category,
                       p.telephone,
                       p.thumbnail_key,
                       p.thumbnail_source
                FROM place_candidates pc
                JOIN places p ON p.id = pc.place_id
                WHERE pc.shared_media_id = ?
                ORDER BY pc.id ASC
                """;
        return jdbcTemplate.query(sql, CANDIDATE_ROW_MAPPER, sharedMediaId);
    }

    public void updateDecisions(
            Long sharedMediaId,
            List<Long> placeIds,
            PlaceDecisionStatus decision,
            Instant decidedAt
    ) {
        if (placeIds.isEmpty()) {
            return;
        }
        String placeholders = placeIds.stream()
                .map(placeId -> "?")
                .collect(Collectors.joining(", "));
        String sql = """
                UPDATE place_candidates
                SET decision_status = ?, decided_at = ?
                WHERE shared_media_id = ?
                  AND place_id IN (%s)
                  AND decision_status = 'UNDECIDED'
                """.formatted(placeholders);
        List<Object> arguments = new ArrayList<>(List.of(decision.name(), Timestamp.from(decidedAt), sharedMediaId));
        arguments.addAll(placeIds);
        jdbcTemplate.update(sql, arguments.toArray());
    }

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
        return jdbcTemplate.query(sql, PLACE_CANDIDATE_PROJECTION_ROW_MAPPER, sharedMediaIds.toArray());
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
        return jdbcTemplate.query(sql, PLACE_CANDIDATE_PROJECTION_ROW_MAPPER, sharedMediaId);
    }
}
