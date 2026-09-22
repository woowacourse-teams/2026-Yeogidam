package com.yeogidam.support.fixture.sql;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * shared_media_saved_places(어느 공유에서 저장했나) 행을 DAO를 거치지 않고 직접 넣는다.
 * SAVED 후보 하나에 연결 행 하나라는 불변식은 테스트가 지켜서 넣는다.
 */
public final class SavedPlaceShareSqlFixture {

    private SavedPlaceShareSqlFixture() {
    }

    public static void insertSavedPlaceShare(
            JdbcTemplate jdbcTemplate,
            Long savedPlaceShareId,
            Long savedPlaceId,
            Long sharedMediaId,
            Instant savedAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media_saved_places (id, saved_place_id, shared_media_id, created_at)
                VALUES (?, ?, ?, ?)
                """,
                savedPlaceShareId, savedPlaceId, sharedMediaId, LocalDateTime.ofInstant(savedAt, ZoneOffset.UTC)
        );
    }
}
