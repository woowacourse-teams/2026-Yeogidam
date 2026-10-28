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

    /**
     * 회원의 폴더 하나를 지우고, 없는 폴더나 남의 폴더는 member_id 조건에 걸려 지워지지 않는다.
     * 폴더와 보관함 장소를 잇는 연결 행(folder_saved_places)만 FK의 ON DELETE CASCADE로 함께 지워지고, 보관함 장소(saved_places)는 그대로 남는다.
     */
    public int deleteByMemberAndId(Long memberId, Long folderId) {
        String sql = """
                DELETE FROM folders
                WHERE member_id = ?
                  AND id = ?
                """;
        return jdbcTemplate.update(sql, memberId, folderId);
    }
}
