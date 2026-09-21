package com.yeogidam.support.sql;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * saved_places 행을 DAO를 거치지 않고 직접 넣는다. 저장 시각은 DAO와 같은 규칙(UTC LocalDateTime)으로 쓴다.
 */
public final class SavedPlaceSqlFixture {

    private SavedPlaceSqlFixture() {
    }

    public static void insertSavedPlace(
            JdbcTemplate jdbcTemplate,
            Long savedPlaceId,
            Long memberId,
            Long placeId,
            Instant lastSavedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO saved_places (id, member_id, place_id, last_saved_at)
                VALUES (?, ?, ?, ?)
                """,
                savedPlaceId, memberId, placeId, LocalDateTime.ofInstant(lastSavedAt, ZoneOffset.UTC)
        );
    }
}
