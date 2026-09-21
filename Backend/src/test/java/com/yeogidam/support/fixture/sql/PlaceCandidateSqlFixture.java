package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
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
            Timestamp decidedAt
    ) {
        insertCandidate(jdbcTemplate, placeCandidateId, sharedMediaId, placeId, "SAVED", decidedAt);
    }

    public static void insertDiscardedCandidate(
            JdbcTemplate jdbcTemplate,
            Long placeCandidateId,
            Long sharedMediaId,
            Long placeId,
            Timestamp decidedAt
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
            Timestamp decidedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO place_candidates (id, shared_media_id, place_id, decision_status, decided_at)
                VALUES (?, ?, ?, ?, ?)
                """, placeCandidateId, sharedMediaId, placeId, decisionStatus, decidedAt);
    }
}
