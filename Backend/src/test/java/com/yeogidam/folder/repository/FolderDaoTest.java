package com.yeogidam.folder.repository;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.folder.domain.Folder;
import com.yeogidam.folder.domain.FolderColor;
import com.yeogidam.folder.domain.FolderName;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 조회, 저장, 수정, 삭제가 실제 MySQL에서 회원 조건, 정렬, 읽은 값, 생성된 식별자, 이름 중복, 연결 삭제까지 맞게 동작하는지 검증한다.
 * 행은 SQL fixture로 given에서 직접 넣는다.
 */
@Import(FolderDao.class)
class FolderDaoTest extends JdbcTestSupport {

    @Autowired
    private FolderDao folderDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 내_폴더만_만든_순서대로_읽는다() {
        // given: 회원 1의 폴더를 3, 1, 2 순서로 넣고 회원 2의 폴더 4를 넣으며, id가 작을수록 먼저 만든 폴더로 본다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertFolder(jdbcTemplate, 3L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 1L, 1L, "가보고 싶은 곳", "GREEN");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        insertFolder(jdbcTemplate, 4L, 2L, "남의 폴더", "PINK");

        // when
        List<FolderProjection> folders = folderDao.findAllByMember(1L);

        // then
        assertThat(folders).extracting(FolderProjection::folderId)
                .containsExactly(1L, 2L, 3L);
    }

    @Test
    void 만든_폴더가_없으면_빈_목록을_읽는다() {
        // given
        insertMember(1L, "user-1");

        // when & then
        assertThat(folderDao.findAllByMember(1L)).isEmpty();
    }

    @Test
    void 폴더_식별자와_이름과_색이_빠짐없이_읽힌다() {
        // given
        insertMember(1L, "user-1");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");

        // when
        FolderProjection folder = folderDao.findAllByMember(1L)
                .getFirst();

        // then
        assertAll(
                () -> assertThat(folder.folderId()).isEqualTo(1L),
                () -> assertThat(folder.name()).isEqualTo("데이트 장소"),
                () -> assertThat(folder.color()).isEqualTo("RED")
        );
    }

    @Test
    void 내_폴더를_식별자로_읽는다() {
        // given
        insertMember(1L, "user-1");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");

        // when
        Folder folder = folderDao.findByMemberAndId(1L, 1L)
                .orElseThrow();

        // then
        assertAll(
                () -> assertThat(folder.getId()).isEqualTo(1L),
                () -> assertThat(folder.getName()).isEqualTo(new FolderName("데이트 장소")),
                () -> assertThat(folder.getColor()).isEqualTo(FolderColor.RED)
        );
    }

    @Test
    void 없는_폴더나_남의_폴더는_읽지_않는다() {
        // given: 회원 1은 폴더 1을, 회원 2는 폴더 2를 가졌다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 2L, "남의 폴더", "PINK");

        // when & then
        assertAll(
                () -> assertThat(folderDao.findByMemberAndId(1L, 999L)).isEmpty(),
                () -> assertThat(folderDao.findByMemberAndId(1L, 2L)).isEmpty()
        );
    }

    @Test
    void 내_폴더를_모두_도메인_객체로_읽는다() {
        // given: 회원 1은 폴더 1, 2를, 회원 2는 폴더 3을 가졌다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        insertFolder(jdbcTemplate, 3L, 2L, "남의 폴더", "PINK");

        // when
        List<Folder> folders = folderDao.findFoldersByMember(1L);

        // then
        assertThat(folders).extracting(Folder::getId)
                .containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void 폴더를_저장하면_생성된_식별자를_담아_돌려준다() {
        // given
        insertMember(1L, "user-1");

        // when
        Folder saved = folderDao.save(1L, new Folder(new FolderName("데이트 장소"), FolderColor.RED));

        // then
        assertAll(
                () -> assertThat(saved.getId()).isNotNull(),
                () -> assertThat(readName(saved.getId())).isEqualTo("데이트 장소"),
                () -> assertThat(readColor(saved.getId())).isEqualTo("RED"),
                () -> assertThat(count("folders WHERE member_id = 1")).isEqualTo(1)
        );
    }

    @Test
    void 폴더_이름과_색을_바꾼다() {
        // given: 회원 1이 폴더 1(데이트 장소, RED)을 가졌다
        insertMember(1L, "user-1");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");

        // when
        folderDao.update(1L, new Folder(1L, new FolderName("데이트 코스"), FolderColor.PINK));

        // then
        assertAll(
                () -> assertThat(readName(1L)).isEqualTo("데이트 코스"),
                () -> assertThat(readColor(1L)).isEqualTo("PINK")
        );
    }

    @Test
    void 같은_회원의_다른_폴더와_이름이_겹치면_예외가_발생한다() {
        // given: 회원 1은 폴더 1(데이트 장소)과 폴더 2(성수 카페)를 가졌고, 폴더 2의 이름을 데이트 장소로 바꾸려 한다
        insertMember(1L, "user-1");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 1L, "성수 카페", "TEAL");
        Folder renamed = new Folder(2L, new FolderName("데이트 장소"), FolderColor.TEAL);

        // when & then
        assertThatThrownBy(() -> folderDao.update(1L, renamed))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void 폴더를_지우면_담긴_연결만_지워지고_보관함_장소는_남는다() {
        // given: 회원 1이 장소 1을 보관함 11로 저장하고 폴더 1에 담았다
        insertMember(1L, "user-1");
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-1", "카페 온월", "서울 성동구 성수동1가 1-1",
                new BigDecimal("37.5445"), new BigDecimal("127.0560"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-10-28T00:00:00Z"));
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);

        // when
        int deleted = folderDao.deleteByMemberAndId(1L, 1L);

        // then: 폴더 1과 연결 행은 사라지고 보관함 11은 남는다
        assertAll(
                () -> assertThat(deleted).isEqualTo(1),
                () -> assertThat(count("folders WHERE id = 1")).isZero(),
                () -> assertThat(count("folder_saved_places WHERE folder_id = 1")).isZero(),
                () -> assertThat(count("saved_places WHERE id = 11")).isEqualTo(1)
        );
    }

    @Test
    void 없는_폴더나_남의_폴더는_지우지_않는다() {
        // given: 회원 1은 폴더 1을, 회원 2는 폴더 2를 가졌다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertFolder(jdbcTemplate, 1L, 1L, "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, 2L, "남의 폴더", "PINK");

        // when: 회원 1이 없는 폴더 999와 남의 폴더 2를 지우려 한다
        int deletedMissing = folderDao.deleteByMemberAndId(1L, 999L);
        int deletedOthers = folderDao.deleteByMemberAndId(1L, 2L);

        // then: 아무것도 지워지지 않는다
        assertAll(
                () -> assertThat(deletedMissing).isZero(),
                () -> assertThat(deletedOthers).isZero(),
                () -> assertThat(count("folders")).isEqualTo(2)
        );
    }

    private String readName(Long folderId) {
        return jdbcTemplate.queryForObject("SELECT name FROM folders WHERE id = ?", String.class, folderId);
    }

    private String readColor(Long folderId) {
        return jdbcTemplate.queryForObject("SELECT color FROM folders WHERE id = ?", String.class, folderId);
    }

    private int count(String fromWhere) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + fromWhere, Integer.class);
    }

    private void insertMember(Long memberId, String providerUserId) {
        insertKakaoMember(jdbcTemplate, memberId, providerUserId, "kakao-" + providerUserId,
                providerUserId + "@example.com", null);
    }
}
