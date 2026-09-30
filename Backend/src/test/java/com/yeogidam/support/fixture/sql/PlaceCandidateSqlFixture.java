package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

public final class PlaceCandidateSqlFixture {

    private PlaceCandidateSqlFixture() {
    }

    public static void insertUndecidedCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId
    ) {
        insertCandidate(jdbcTemplate, placeCandidateId, sharedMediaId, placeId, "UNDECIDED", null);
    }

    public static void insertSavedCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId,
            Instant decidedAt
    ) {
        insertCandidate(jdbcTemplate, placeCandidateId, sharedMediaId, placeId, "SAVED", decidedAt);
    }

    public static void insertDiscardedCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId,
            Instant decidedAt
    ) {
        insertCandidate(jdbcTemplate, placeCandidateId, sharedMediaId, placeId, "DISCARDED", decidedAt);
    }

    public static void insertSupersededCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId
    ) {
        insertCandidate(jdbcTemplate, placeCandidateId, sharedMediaId, placeId, "SUPERSEDED", null);
    }

    private static void insertCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId,
            String decisionStatus,
            Instant decidedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO place_candidates (id, shared_media_id, place_id, decision_status, decided_at)
                VALUES (?, ?, ?, ?, ?)
                """, placeCandidateId, sharedMediaId, placeId, decisionStatus, toTimestamp(decidedAt));
    }

    // UNDECIDED와 SUPERSEDED는 결정 시각이 없어 null로 들어온다.
    private static Timestamp toTimestamp(Instant decidedAt) {
        if (decidedAt == null) {
            return null;
        }
        return Timestamp.from(decidedAt);
    }
}
