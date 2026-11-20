package com.yeogidam.folder.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class FolderSavedPlaceDao {

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedParameterJdbcTemplate;

    /**
     * 보관함 장소와 폴더가 모두 회원의 것인지 쿼리 한 번으로 보고, 폴더 목록이 비면 보관함 장소만 본다.
     * 빈 Set을 받으면 IN절에서 문법 오류를 던진다.
     */
    public boolean isOwnedByMember(
            Long memberId,
            Long savedPlaceId,
            Set<Long> folderIds
    ) {
        if (folderIds.isEmpty()) {
            return existsSavedPlace(memberId, savedPlaceId);
        }
        String sql = """
                SELECT COUNT(*)
                FROM saved_places sp
                JOIN folders f ON f.member_id = sp.member_id
                WHERE sp.id = :savedPlaceId
                  AND sp.member_id = :memberId
                  AND f.id IN (:folderIds)
                """;
        int ownedFolderCount = namedParameterJdbcTemplate.queryForObject(sql, Map.of(
                "savedPlaceId", savedPlaceId,
                "memberId", memberId,
                "folderIds", folderIds
        ), Integer.class);
        return ownedFolderCount == folderIds.size();
    }

    private boolean existsSavedPlace(Long memberId, Long savedPlaceId) {
        String sql = """
                SELECT EXISTS(
                    SELECT 1
                    FROM saved_places
                    WHERE member_id = ?
                      AND id = ?
                )
                """;
        return jdbcTemplate.queryForObject(sql, Boolean.class, memberId, savedPlaceId);
    }

    /**
     * 보관함 장소가 지금 담긴 폴더 id를 읽는다.
     */
    public List<Long> findFolderIds(Long savedPlaceId) {
        String sql = """
                SELECT folder_id
                FROM folder_saved_places
                WHERE saved_place_id = ?
                """;
        return jdbcTemplate.queryForList(sql, Long.class, savedPlaceId);
    }

    /**
     * 보관함 장소를 여러 폴더에 한 번에 담는다.
     */
    public void saveAll(Long savedPlaceId, List<Long> folderIds) {
        if (folderIds.isEmpty()) {
            return;
        }
        String values = folderIds.stream()
                .map(folderId -> "(?, ?)")
                .collect(Collectors.joining(", "));
        String sql = """
                INSERT INTO folder_saved_places (folder_id, saved_place_id)
                VALUES %s
                """.formatted(values);
        List<Object> arguments = new ArrayList<>();
        folderIds.forEach(folderId -> {
            arguments.add(folderId);
            arguments.add(savedPlaceId);
        });
        jdbcTemplate.update(sql, arguments.toArray());
    }

    /**
     * 고른 폴더에서만 보관함 장소를 빼고, 보관함 항목(saved_places)은 지우지 않는다.
     */
    public void deleteBySavedPlaceAndFolderIds(Long savedPlaceId, List<Long> folderIds) {
        if (folderIds.isEmpty()) {
            return;
        }
        String sql = """
                DELETE FROM folder_saved_places
                WHERE saved_place_id = :savedPlaceId
                  AND folder_id IN (:folderIds)
                """;
        namedParameterJdbcTemplate.update(sql, Map.of(
                "savedPlaceId", savedPlaceId,
                "folderIds", folderIds
        ));
    }
}
