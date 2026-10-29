package com.yeogidam.support.fixture.sql;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * folders 행을 DAO를 거치지 않고 직접 넣으며, 색은 FolderColor 코드(RED 등) 문자열로 받는다.
 */
public final class FolderSqlFixture {

    private FolderSqlFixture() {
    }

    public static void insertFolder(
            JdbcTemplate jdbcTemplate,
            Long folderId,
            Long memberId,
            String name,
            String color
    ) {
        jdbcTemplate.update("""
                INSERT INTO folders (id, member_id, name, color)
                VALUES (?, ?, ?, ?)
                """,
                folderId, memberId, name, color
        );
    }

    public static void insertFolder(
            JdbcTemplate jdbcTemplate,
            Long folderId,
            Long memberId,
            String name,
            String color,
            Instant createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO folders (id, member_id, name, color, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                folderId, memberId, name, color, Timestamp.from(createdAt)
        );
    }
}
