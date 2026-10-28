package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * folder_saved_places 행을 DAO를 거치지 않고 직접 넣는다.
 */
public final class FolderSavedPlaceSqlFixture {

    private FolderSavedPlaceSqlFixture() {
    }

    public static void insertFolderSavedPlace(
            JdbcTemplate jdbcTemplate,
            Long folderSavedPlaceId,
            Long folderId,
            Long savedPlaceId
    ) {
        jdbcTemplate.update("""
                INSERT INTO folder_saved_places (id, folder_id, saved_place_id)
                VALUES (?, ?, ?)
                """,
                folderSavedPlaceId, folderId, savedPlaceId
        );
    }
}
