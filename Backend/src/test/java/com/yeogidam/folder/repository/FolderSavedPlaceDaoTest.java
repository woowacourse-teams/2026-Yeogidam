package com.yeogidam.folder.repository;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보관함 장소와 폴더의 연결을 읽고 담고 빼는 SQL과 소유 확인 쿼리가 실제 MySQL에서 맞게 동작하는지 검증한다.
 * 행은 SQL fixture로 given에서 직접 넣는다.
 */
@Import(FolderSavedPlaceDao.class)
class FolderSavedPlaceDaoTest extends JdbcTestSupport {

    private static final Instant SAVED_AT = Instant.parse("2026-10-28T00:00:00Z");

    @Autowired
    private FolderSavedPlaceDao folderSavedPlaceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 보관함_장소와_폴더가_모두_내_것이면_참이다() {
        // given: 회원 1은 보관함 장소 11과 폴더 1, 2를, 회원 2는 보관함 장소 22와 폴더 3을 가졌다.
        insertMembersWithSavedPlacesAndFolders();

        // when & then
        assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 11L, Set.of(1L, 2L))).isTrue();
    }

    @Test
    void 없거나_남의_보관함_장소면_거짓이다() {
        // given: 회원 1은 보관함 장소 11과 폴더 1, 2를, 회원 2는 보관함 장소 22와 폴더 3을 가졌다.
        insertMembersWithSavedPlacesAndFolders();

        // when & then
        assertAll(
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 22L, Set.of(1L))).isFalse(),
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 999L, Set.of(1L))).isFalse()
        );
    }

    @Test
    void 폴더_중_하나라도_없거나_남의_것이면_거짓이다() {
        // given: 회원 1은 보관함 장소 11과 폴더 1, 2를, 회원 2는 보관함 장소 22와 폴더 3을 가졌다.
        insertMembersWithSavedPlacesAndFolders();

        // when & then
        assertAll(
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 11L, Set.of(1L, 3L))).isFalse(),
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 11L, Set.of(1L, 999L))).isFalse()
        );
    }

    @Test
    void 폴더를_하나도_고르지_않으면_보관함_장소만_확인한다() {
        // given: 회원 1은 보관함 장소 11과 폴더 1, 2를, 회원 2는 보관함 장소 22와 폴더 3을 가졌다.
        insertMembersWithSavedPlacesAndFolders();

        // when & then
        assertAll(
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 11L, Set.of())).isTrue(),
                () -> assertThat(folderSavedPlaceDao.isOwnedByMember(1L, 22L, Set.of())).isFalse()
        );
    }

    @Test
    void 보관함_장소가_담긴_폴더만_읽는다() {
        // given: 보관함 장소 11은 폴더 1과 2에, 보관함 장소 12는 폴더 1에 담겨 있다.
        insertMember(1L, "user-1");
        insertPlace(1L);
        insertPlace(2L);
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 2L, 2L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 3L, 1L, 12L);

        // when
        List<Long> folderIds = folderSavedPlaceDao.findFolderIds(11L);

        // then
        assertThat(folderIds).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void 보관함_장소를_여러_폴더에_한_번에_담는다() {
        // given: 회원 1은 보관함 장소 11과 폴더 1, 2를, 회원 2는 보관함 장소 22와 폴더 3을 가졌다.
        insertMembersWithSavedPlacesAndFolders();

        // when
        folderSavedPlaceDao.saveAll(11L, List.of(1L, 2L));

        // then
        assertThat(readFolderIds(11L)).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void 고른_폴더에서만_보관함_장소를_뺀다() {
        // given: 보관함 장소 11은 폴더 1과 2에 담겨 있다.
        insertMembersWithSavedPlacesAndFolders();
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 2L, 2L, 11L);

        // when
        folderSavedPlaceDao.deleteBySavedPlaceAndFolderIds(11L, List.of(1L));

        // then
        assertThat(readFolderIds(11L)).containsExactly(2L);
    }

    private void insertMembersWithSavedPlacesAndFolders() {
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertPlace(1L);
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 22L, 2L, 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        insertFolder(jdbcTemplate, 3L, 2L, "남의 폴더", "PINK");
    }

    private List<Long> readFolderIds(Long savedPlaceId) {
        return jdbcTemplate.queryForList("SELECT folder_id FROM folder_saved_places WHERE saved_place_id = ?",
                Long.class, savedPlaceId);
    }

    private void insertMember(Long memberId, String providerUserId) {
        insertKakaoMember(jdbcTemplate, memberId, providerUserId, "kakao-" + providerUserId,
                providerUserId + "@example.com", null);
    }

    private void insertPlace(Long placeId) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, placeId, "kakao-" + placeId, "카페 온월 " + placeId,
                "서울 성동구 성수동1가 1-1", new BigDecimal("37.5445"), new BigDecimal("127.0560"));
    }
}
