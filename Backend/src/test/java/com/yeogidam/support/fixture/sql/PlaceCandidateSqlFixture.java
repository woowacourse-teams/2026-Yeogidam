package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class PlaceCandidateSqlFixture {

    private PlaceCandidateSqlFixture() {
    }

    public static void createPlaceCandidate(
            JdbcTemplate jdbcTemplate,
            Long candidateId,
            Long sharedMediaId,
            Long placeId,
            String decisionStatus
    ) {
        jdbcTemplate.update("""
                INSERT INTO place_candidates (id, shared_media_id, place_id, decision_status)
                VALUES (?, ?, ?, ?)
                """, candidateId, sharedMediaId, placeId, decisionStatus);
    }
}
