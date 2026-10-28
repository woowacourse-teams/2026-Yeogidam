package com.yeogidam.folder.repository;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class FolderDao {

    private static final RowMapper<FolderProjection> PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new FolderProjection(
                    resultSet.getLong("folder_id"),
                    resultSet.getString("name"),
                    resultSet.getString("color")
            );

    private final JdbcTemplate jdbcTemplate;

    /**
     * 회원의 폴더를 만든 순서(id 오름차순)로 읽고, 남의 폴더는 member_id 조건에 걸려 빠진다.
     */
    public List<FolderProjection> findAllByMember(Long memberId) {
        String sql = """
                SELECT id AS folder_id,
                       name,
                       color
                FROM folders
                WHERE member_id = ?
                ORDER BY id
                """;
        return jdbcTemplate.query(sql, PROJECTION_ROW_MAPPER, memberId);
    }
}
