package com.yeogidam.folder.repository;

import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 목록 조회가 실제 MySQL에서 회원 조건, 정렬, 읽은 값까지 맞게 동작하는지 검증한다.
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

    private void insertMember(Long memberId, String providerUserId) {
        insertKakaoMember(jdbcTemplate, memberId, providerUserId, "kakao-" + providerUserId,
                providerUserId + "@example.com", null);
    }
}
