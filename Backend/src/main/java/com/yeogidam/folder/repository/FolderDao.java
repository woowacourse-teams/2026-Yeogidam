package com.yeogidam.folder.repository;

import com.yeogidam.folder.domain.Folder;
import com.yeogidam.folder.domain.FolderColor;
import com.yeogidam.folder.domain.FolderName;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
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

    private static final RowMapper<Folder> FOLDER_ROW_MAPPER = (resultSet, rowNumber) ->
            new Folder(
                    resultSet.getLong("id"),
                    new FolderName(resultSet.getString("name")),
                    FolderColor.valueOf(resultSet.getString("color"))
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
     * 회원의 폴더 하나를 도메인 객체로 읽고, 없는 폴더나 남의 폴더면 빈 값을 돌려준다.
     */
    public Optional<Folder> findByMemberAndId(Long memberId, Long folderId) {
        String sql = """
                SELECT id,
                       name,
                       color
                FROM folders
                WHERE member_id = ?
                  AND id = ?
                """;
        return jdbcTemplate.query(sql, FOLDER_ROW_MAPPER, memberId, folderId)
                .stream()
                .findFirst();
    }

    /**
     * 10개 제한을 검사하려고 회원의 폴더를 모두 도메인 객체로 읽는다.
     */
    public List<Folder> findFoldersByMember(Long memberId) {
        String sql = """
                SELECT id,
                       name,
                       color
                FROM folders
                WHERE member_id = ?
                """;
        return jdbcTemplate.query(sql, FOLDER_ROW_MAPPER, memberId);
    }

    /**
     * 회원의 폴더를 새로 저장하고 생성된 id를 담은 폴더를 돌려주며, 같은 회원의 폴더와 이름이 겹치면 UNIQUE 제약(uk_folders_member_name)에 걸려 DuplicateKeyException이 난다.
     */
    public Folder save(Long memberId, Folder folder) {
        String sql = """
                INSERT INTO folders (member_id, name, color)
                VALUES (?, ?, ?)
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, memberId);
            statement.setString(2, folder.getName().value());
            statement.setString(3, folder.getColor().name());
            return statement;
        }, keyHolder);
        return new Folder(keyHolder.getKey().longValue(), folder.getName(), folder.getColor());
    }

    /**
     * 회원의 폴더 이름과 색을 바꾸며, 같은 회원의 다른 폴더와 이름이 겹치면 UNIQUE 제약(uk_folders_member_name)에 걸려 DuplicateKeyException이 난다.
     */
    public void update(Long memberId, Folder folder) {
        String sql = """
                UPDATE folders
                SET name = ?,
                    color = ?
                WHERE member_id = ?
                  AND id = ?
                """;
        jdbcTemplate.update(sql, folder.getName().value(), folder.getColor().name(), memberId, folder.getId());
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
