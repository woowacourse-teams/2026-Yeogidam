package com.yeogidam.folder.service;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.folder.dto.request.FolderAssignmentRequest;
import com.yeogidam.support.IntegrationTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 담기가 남기는 연결 행을 서비스와 DB로 검증한다. 응답이 204뿐이라 결과가 HTTP로 보이지 않고,
 * 보관함 응답의 folderIds로 하는 왕복 확인은 #474가 머지된 뒤 E2E에 더한다.
 */
class FolderAssignmentIntegrationTest extends IntegrationTestSupport {

    private static final Instant SAVED_AT = Instant.parse("2026-10-28T00:00:00Z");

    @Autowired
    private FolderAssignmentService folderAssignmentService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 고른_폴더대로_담긴_폴더를_바꾼다() {
        // given: 보관함 장소 11은 폴더 1과 2에 담겨 있고, 폴더 2와 3으로 바꾸려 한다.
        insertSavedPlaceAndFolders();
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 2L, 2L, 11L);

        // when
        folderAssignmentService.updateFolderAssignment(1L, 11L, new FolderAssignmentRequest(Set.of(2L, 3L)));

        // then
        assertThat(readFolderIds(11L)).containsExactlyInAnyOrder(2L, 3L);
    }

    @Test
    void 이미_담긴_폴더는_다시_넣지_않고_그대로_둔다() {
        // given: 보관함 장소 11은 폴더 1에 연결 100으로 담겨 있다.
        insertSavedPlaceAndFolders();
        insertFolderSavedPlace(jdbcTemplate, 100L, 1L, 11L);

        // when
        folderAssignmentService.updateFolderAssignment(1L, 11L, new FolderAssignmentRequest(Set.of(1L, 2L)));

        // then
        assertAll(
                () -> assertThat(readFolderIds(11L)).containsExactlyInAnyOrder(1L, 2L),
                () -> assertThat(count("folder_saved_places WHERE id = 100 AND folder_id = 1")).isEqualTo(1)
        );
    }

    @Test
    void 폴더를_하나도_고르지_않으면_모든_폴더에서_빼고_보관함에는_남긴다() {
        // given: 보관함 장소 11은 폴더 1과 2에 담겨 있다.
        insertSavedPlaceAndFolders();
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 2L, 2L, 11L);

        // when
        folderAssignmentService.updateFolderAssignment(1L, 11L, new FolderAssignmentRequest(Set.of()));

        // then
        assertAll(
                () -> assertThat(readFolderIds(11L)).isEmpty(),
                () -> assertThat(count("saved_places WHERE id = 11")).isEqualTo(1)
        );
    }

    @Test
    void 같은_요청을_다시_보내도_결과가_같다() {
        // given
        insertSavedPlaceAndFolders();
        FolderAssignmentRequest request = new FolderAssignmentRequest(Set.of(1L, 2L));

        // when
        folderAssignmentService.updateFolderAssignment(1L, 11L, request);
        folderAssignmentService.updateFolderAssignment(1L, 11L, request);

        // then
        assertThat(readFolderIds(11L)).containsExactlyInAnyOrder(1L, 2L);
    }

    private void insertSavedPlaceAndFolders() {
        insertKakaoMember(jdbcTemplate, 1L, "user-1", "kakao-user-1", "user-1@example.com", null);
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-1", "카페 온월", "서울 성동구 성수동1가 1-1",
                new BigDecimal("37.5445"), new BigDecimal("127.0560"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        insertFolder(jdbcTemplate, 3L, 1L, "가보고 싶은 곳", "GREEN");
    }

    private List<Long> readFolderIds(Long savedPlaceId) {
        return jdbcTemplate.queryForList("SELECT folder_id FROM folder_saved_places WHERE saved_place_id = ?",
                Long.class, savedPlaceId);
    }

    private int count(String fromWhere) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + fromWhere, Integer.class);
    }
}
