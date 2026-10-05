package com.yeogidam.support.fixture.sql;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 후보 결정 테스트의 입력 데이터와 DB 상태 관찰을 담당한다. 프로덕션 쓰기 코드는 호출하지 않는다.
 */
@RequiredArgsConstructor
public final class PlaceDecisionSqlFixture {

    private final JdbcTemplate jdbcTemplate;

    public static Long candidateId(Long sharedMediaId, Long placeId) {
        return sharedMediaId * 100 + placeId;
    }

    private static Instant toInstant(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
    }

    public void createPlaces(List<Long> placeIds) {
        placeIds.forEach(placeId -> insertPlaceWithRequiredColumnsOnly(
                jdbcTemplate, placeId, "decision-place-" + placeId, "장소 " + placeId,
                "서울 성동구 성수동", new BigDecimal("37.5445"), new BigDecimal("127.0561")));
    }

    public void createShare(Long memberId, Long sharedMediaId, Long mediaId, Instant createdAt) {
        insertMedia(jdbcTemplate, mediaId, "후보 결정 테스트", "media-" + mediaId + ".jpg", "@decision_test");
        createShareForExistingMedia(memberId, sharedMediaId, mediaId, createdAt);
    }

    public void createShareForExistingMedia(
            Long memberId,
            Long sharedMediaId,
            Long mediaId,
            Instant createdAt
    ) {
        insertSharedMedia(jdbcTemplate, sharedMediaId, memberId, mediaId,
                "https://www.instagram.com/reel/fixture-media-" + mediaId + "/", createdAt);
    }

    public void createUndecidedCandidates(Long sharedMediaId, List<Long> placeIds) {
        placeIds.forEach(placeId -> insertUndecidedCandidate(
                jdbcTemplate, candidateId(sharedMediaId, placeId), sharedMediaId, placeId));
    }

    public void createMediaPlaces(Long mediaId, List<Long> placeIds) {
        placeIds.forEach(placeId -> jdbcTemplate.update("""
                INSERT INTO media_places (media_id, place_id)
                VALUES (?, ?)
                """, mediaId, placeId));
    }

    public Long latestSharedMediaId(Long memberId, Long mediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT MAX(id)
                FROM shared_media
                WHERE member_id = ? AND media_id = ?
                """, Long.class, memberId, mediaId);
    }

    public CandidateState candidate(Long sharedMediaId, Long placeId) {
        return jdbcTemplate.queryForObject("""
                SELECT decision_status, decided_at
                FROM place_candidates
                WHERE shared_media_id = ? AND place_id = ?
                """, (resultSet, rowNumber) -> new CandidateState(
                resultSet.getString("decision_status"), toInstant(resultSet.getTimestamp("decided_at"))),
                sharedMediaId, placeId);
    }

    public SavedPlaceState savedPlace(Long memberId, Long placeId) {
        return jdbcTemplate.queryForObject("""
                SELECT id, last_saved_at
                FROM saved_places
                WHERE member_id = ? AND place_id = ?
                """, (resultSet, rowNumber) -> new SavedPlaceState(
                resultSet.getLong("id"), resultSet.getTimestamp("last_saved_at").toInstant()),
                memberId, placeId);
    }

    public List<Long> linkedShareIds(Long savedPlaceId) {
        return jdbcTemplate.queryForList("""
                SELECT shared_media_id
                FROM shared_media_saved_places
                WHERE saved_place_id = ?
                ORDER BY shared_media_id
                """, Long.class, savedPlaceId);
    }

    public List<ShareLinkState> shareLinks() {
        return jdbcTemplate.query("""
                SELECT saved_place_id, shared_media_id, created_at
                FROM shared_media_saved_places
                ORDER BY id
                """, (resultSet, rowNumber) -> new ShareLinkState(
                resultSet.getLong("saved_place_id"), resultSet.getLong("shared_media_id"),
                resultSet.getTimestamp("created_at").toInstant()));
    }

    /**
     * 후보 결정 전후의 후보, 보관함, 연결, 공유 기록을 비교할 수 있도록 기록한다.
     */
    public State captureState() {
        return new State(
                jdbcTemplate.queryForList("SELECT * FROM place_candidates ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM saved_places ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media_saved_places ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media ORDER BY id"));
    }

    public record CandidateState(String decision, Instant decidedAt) {
    }

    public record SavedPlaceState(Long savedPlaceId, Instant lastSavedAt) {
    }

    public record ShareLinkState(Long savedPlaceId, Long sharedMediaId, Instant createdAt) {
    }

    public record State(
            List<Map<String, Object>> candidates,
            List<Map<String, Object>> savedPlaces,
            List<Map<String, Object>> links,
            List<Map<String, Object>> shares
    ) {
    }
}
