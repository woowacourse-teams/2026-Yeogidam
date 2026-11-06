package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 보관함 저장·조회·삭제와 공유 연결이 실제 MySQL에서 동작하는지 검증한다.
 * 행은 SQL fixture로 given에서 직접 넣는다.
 */
@Import(SavedPlaceDao.class)
class SavedPlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private SavedPlaceDao savedPlaceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void 처음_저장하는_장소면_보관함에_장소가_생성된다() {
        // given
        insertMember(1L, "save-new-owner");
        insertMember(2L, "save-new-other");
        insertThreePlaces();
        Instant savedAt = Instant.parse("2026-10-01T10:00:00.123456Z");
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, savedAt.minusSeconds(10));

        // when
        savedPlaceDao.saveOrUpdate(new SavedPlace(1L, 1L, savedAt));

        // then
        List<SavedPlaceProjection> savedPlaces = savedPlaceDao.findAllByMember(1L);
        assertThat(savedPlaces).hasSize(1);
        SavedPlaceProjection savedPlace = savedPlaces.getFirst();
        assertAll(
                () -> assertThat(savedPlace.savedPlaceId()).isPositive(),
                () -> assertThat(savedPlace.savedPlaceId()).isNotEqualTo(21L),
                () -> assertThat(savedPlace.placeId()).isEqualTo(1L),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(savedAt),
                () -> assertThat(count("saved_places")).isEqualTo(2),
                () -> assertThat(readSavedAt(21L)).isEqualTo(savedAt.minusSeconds(10))
        );
    }

    @Test
    void 같은_회원이_같은_장소를_재저장하면_기존_ID를_유지하고_대상_행의_시각만_갱신한다() {
        // given
        insertMember(1L, "save-again-owner");
        insertMember(2L, "save-again-other");
        insertThreePlaces();
        Instant previous = Instant.parse("2026-10-01T10:00:00.123456Z");
        Instant savedAt = previous.plusSeconds(10);
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, previous);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, previous);
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, previous);

        // when
        savedPlaceDao.saveOrUpdate(new SavedPlace(1L, 1L, savedAt));

        // then
        assertAll(
                () -> assertThat(count("saved_places")).isEqualTo(3),
                () -> assertThat(readSavedAt(11L)).isEqualTo(savedAt),
                () -> assertThat(readSavedAt(12L)).isEqualTo(previous),
                () -> assertThat(readSavedAt(21L)).isEqualTo(previous)
        );
    }

    @Test
    void 이미_보관함에_있는_장소를_다시_저장하면_새로_넣지_않은_것으로_돌려준다() {
        // given: 보관함 11은 이미 장소 1을 저장했다
        insertMember(1L, "save-existing-owner");
        insertThreePlaces();
        Instant previous = Instant.parse("2026-10-01T10:00:00.123456Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, previous);

        // when
        boolean isCreated = savedPlaceDao.saveOrUpdate(new SavedPlace(1L, 1L, previous.plusSeconds(10)));

        // then
        assertThat(isCreated).isFalse();
    }

    @Test
    void 회원과_장소가_모두_일치하는_보관함_ID를_조회한다() {
        // given
        insertMember(1L, "saved-id-owner");
        insertMember(2L, "saved-id-other");
        insertThreePlaces();
        Instant previous = Instant.parse("2026-10-01T10:00:00Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, previous);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, previous);
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, previous);

        // when & then
        assertAll(
                () -> assertThat(savedPlaceDao.findIdByMemberAndPlaceForUpdate(1L, 1L))
                        .contains(11L),
                () -> assertThat(savedPlaceDao.findIdByMemberAndPlaceForUpdate(1L, 2L))
                        .contains(12L),
                () -> assertThat(savedPlaceDao.findIdByMemberAndPlaceForUpdate(2L, 1L))
                        .contains(21L)
        );
    }

    @Test
    void 다른_회원만_저장한_장소의_보관함_ID는_읽지_않는다() {
        // given: 장소 1은 회원 2만 저장했다
        insertMember(1L, "saved-id-empty-owner");
        insertMember(2L, "saved-id-empty-other");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, Instant.parse("2026-10-01T10:00:00Z"));

        // when
        Optional<Long> savedPlaceId = savedPlaceDao.findIdByMemberAndPlaceForUpdate(1L, 1L);

        // then
        assertThat(savedPlaceId).isEmpty();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void 다른_트랜잭션이_지운_장소를_다시_저장하면_새_보관함_ID를_읽는다() {
        // given
        insertMember(1L, "saved-id-stale-owner");
        insertThreePlaces();
        Instant previous = Instant.parse("2026-10-01T10:00:00Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, previous);
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        TransactionTemplate otherTransaction = new TransactionTemplate(transactionManager);
        otherTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        try {
            // when
            Long savedPlaceId = transaction.execute(status -> {
                assertThat(savedPlaceDao.findAllByMember(1L)).hasSize(1);
                otherTransaction.executeWithoutResult(otherStatus ->
                        savedPlaceDao.deleteByMemberAndIds(1L, List.of(11L)));
                savedPlaceDao.saveOrUpdate(new SavedPlace(1L, 1L, previous.plusSeconds(60)));
                return savedPlaceDao.findIdByMemberAndPlaceForUpdate(1L, 1L).orElseThrow();
            });

            // then: 스냅숏에 남은 옛 ID 11이 아니라 지금 남은 항목의 ID를 읽는다
            assertAll(
                    () -> assertThat(savedPlaceId).isNotEqualTo(11L),
                    () -> assertThat(savedPlaceId).isEqualTo(readSavedPlaceId(1L, 1L))
            );
        } finally {
            jdbcTemplate.update("DELETE FROM saved_places WHERE member_id = ?", 1L);
            jdbcTemplate.update("DELETE FROM places WHERE id IN (1, 2, 3)");
            jdbcTemplate.update("DELETE FROM members WHERE id = ?", 1L);
        }
    }

    @Test
    void 공유_연결은_중복_저장해도_기존_정보를_유지하고_새_연결을_저장한다() {
        // given
        insertMember(1L, "saved-share-owner");
        insertThreePlaces();
        Instant previous = Instant.parse("2026-10-01T10:00:00.123456Z");
        Instant savedAt = previous.plusSeconds(10);
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, previous);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, previous);
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertSharedMedia(jdbcTemplate, 100L, 1L, 1L, previous);
        insertSharedMedia(jdbcTemplate, 102L, 1L, 1L, savedAt);
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, previous);

        // when
        savedPlaceDao.saveShareIfAbsent(11L, 100L, savedAt);
        savedPlaceDao.saveShareIfAbsent(11L, 102L, savedAt);
        savedPlaceDao.saveShareIfAbsent(12L, 100L, savedAt);

        // then
        assertAll(
                () -> assertThat(count("shared_media_saved_places")).isEqualTo(3),
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT id FROM shared_media_saved_places WHERE saved_place_id = ? AND shared_media_id = ?",
                        Long.class, 11L, 100L)).isEqualTo(1L),
                () -> assertThat(readShareSavedAt(11L, 100L)).isEqualTo(previous),
                () -> assertThat(readShareSavedAt(11L, 102L)).isEqualTo(savedAt),
                () -> assertThat(readShareSavedAt(12L, 100L)).isEqualTo(savedAt)
        );
    }

    @Test
    void 보관함을_최근에_저장한_순서대로_조회한다() {
        // given
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 13L, 1L, 3L, Instant.parse("2026-09-15T00:00:10Z"));

        // when
        List<SavedPlaceProjection> savedPlaces = savedPlaceDao.findAllByMember(1L);

        // then
        assertAll(
                () -> assertThat(savedPlaces).extracting(SavedPlaceProjection::savedPlaceId)
                        .containsExactly(13L, 12L, 11L),
                () -> assertThat(savedPlaces).extracting(SavedPlaceProjection::placeId)
                        .containsExactly(3L, 2L, 1L)
        );
    }

    @Test
    void 보관함_항목마다_폴더_ID를_담은_시각_순서대로_조회한다() {
        // given
        insertMember(1L, "user-1");
        insertThreePlaces();
        Instant savedAt = Instant.parse("2026-09-15T00:00:00Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, savedAt);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, savedAt);
        Instant createdAt = Instant.parse("2026-09-14T00:00:00.123456Z");
        insertFolder(jdbcTemplate, 51L, 1L, "성수 카페", "RED", createdAt);
        insertFolder(jdbcTemplate, 52L, 1L, "가고 싶은 곳", "GREEN", createdAt.plusNanos(1_000));
        Instant addedAt = Instant.parse("2026-09-16T00:00:00Z");
        insertFolderSavedPlace(jdbcTemplate, 1L, 51L, 11L, addedAt.plusNanos(1_000));
        insertFolderSavedPlace(jdbcTemplate, 2L, 52L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 3L, 52L, 12L, addedAt);

        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMember(1L);

        // then
        assertAll(
                () -> assertThat(folders.folderIdsOf(11L))
                        .containsExactly(52L, 51L),
                () -> assertThat(folders.folderIdsOf(12L))
                        .containsExactly(52L)
        );
    }

    @Test
    void 폴더에_담은_시각이_같으면_연결_ID_순서대로_조회한다() {
        // given
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertFolder(jdbcTemplate, 51L, 1L, "성수 카페", "RED");
        insertFolder(jdbcTemplate, 52L, 1L, "가고 싶은 곳", "GREEN");
        Instant addedAt = Instant.parse("2026-09-16T00:00:00Z");
        insertFolderSavedPlace(jdbcTemplate, 2L, 51L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 1L, 52L, 11L, addedAt);

        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMember(1L);

        // then
        assertThat(folders.folderIdsOf(11L))
                .containsExactly(52L, 51L);
    }

    @Test
    void 회원의_폴더와_보관함_항목이_연결된_것만_조회한다() {
        // given
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        Instant savedAt = Instant.parse("2026-09-15T00:00:00Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, savedAt);
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, savedAt);
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, savedAt);
        insertFolder(jdbcTemplate, 51L, 1L, "내 폴더", "RED");
        insertFolder(jdbcTemplate, 61L, 2L, "다른 회원 폴더", "GREEN");
        insertFolderSavedPlace(jdbcTemplate, 1L, 51L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 2L, 61L, 21L);
        insertFolderSavedPlace(jdbcTemplate, 3L, 61L, 11L);
        insertFolderSavedPlace(jdbcTemplate, 4L, 61L, 12L);
        insertFolderSavedPlace(jdbcTemplate, 5L, 51L, 21L);

        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMember(1L);

        // then
        assertAll(
                () -> assertThat(folders.folderIdsOf(11L))
                        .containsExactly(51L),
                () -> assertThat(folders.folderIdsOf(12L))
                        .isEmpty(),
                () -> assertThat(folders.folderIdsOf(21L))
                        .isEmpty()
        );
    }

    @Test
    void 장소_정보와_저장_시각이_빠짐없이_매핑된다() {
        // given
        insertMember(1L, "user-1");
        insertPlaceWithEveryColumnFilled();
        Instant lastSavedAt = Instant.parse("2026-09-15T00:00:00.123456Z");
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, lastSavedAt);

        // when
        SavedPlaceProjection savedPlace = savedPlaceDao.findAllByMember(1L).getFirst();

        // then
        assertAll(
                () -> assertThat(savedPlace.savedPlaceId()).isEqualTo(11L),
                () -> assertThat(savedPlace.placeId()).isEqualTo(1L),
                () -> assertThat(savedPlace.name()).isEqualTo("카페 온월"),
                () -> assertThat(savedPlace.category()).isEqualTo("음식점 > 카페"),
                () -> assertThat(savedPlace.landLotAddress()).isEqualTo("서울 성동구 성수동2가 289-10"),
                () -> assertThat(savedPlace.roadAddress()).isEqualTo("서울 성동구 성수이로 26 2층"),
                () -> assertThat(savedPlace.latitude()).isEqualByComparingTo(new BigDecimal("37.5445")),
                () -> assertThat(savedPlace.longitude()).isEqualByComparingTo(new BigDecimal("127.0561")),
                () -> assertThat(savedPlace.kakaoPlaceUrl()).isEqualTo("https://place.map.kakao.com/1"),
                () -> assertThat(savedPlace.telephone()).isEqualTo("02-1234-5678"),
                () -> assertThat(savedPlace.thumbnailKey()).isEqualTo("https://img.example.com/1.jpg"),
                () -> assertThat(savedPlace.thumbnailSource()).isEqualTo("GOOGLE"),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(lastSavedAt)
        );
    }

    @Test
    void 비어_있는_값은_null로_매핑된다() {
        // given
        insertMember(1L, "user-1");
        insertPlaceWithOptionalColumnsNull();
        insertSavedPlace(jdbcTemplate, 1L, 1L, 2L, Instant.parse("2026-09-15T00:00:00Z"));

        // when
        SavedPlaceProjection savedPlace = savedPlaceDao.findAllByMember(1L).getFirst();

        // then
        assertAll(
                () -> assertThat(savedPlace.placeId()).isEqualTo(2L),
                () -> assertThat(savedPlace.category()).isNull(),
                () -> assertThat(savedPlace.roadAddress()).isNull(),
                () -> assertThat(savedPlace.kakaoPlaceUrl()).isNull(),
                () -> assertThat(savedPlace.telephone()).isNull(),
                () -> assertThat(savedPlace.thumbnailKey()).isNull(),
                () -> assertThat(savedPlace.thumbnailSource()).isNull()
        );
    }

    @Test
    void 다른_회원의_보관함은_섞이지_않는다() {
        // given
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 1L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 2L, 1L, 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 3L, 2L, 3L, Instant.parse("2026-09-15T00:00:10Z"));

        // when & then
        assertThat(savedPlaceDao.findAllByMember(2L)).extracting(SavedPlaceProjection::placeId)
                .containsExactly(3L);
    }

    @Test
    void 저장한_장소가_없으면_빈_목록이다() {
        // given
        insertMember(1L, "user-1");

        // when & then
        assertThat(savedPlaceDao.findAllByMember(1L)).isEmpty();
    }

    @Test
    void 내_보관함_항목이면_존재한다() {
        // given: 보관함 11(장소 1)은 회원 1의 것이다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        assertThat(savedPlaceDao.existsByMemberAndId(1L, 11L)).isTrue();
    }

    @Test
    void 없는_항목이거나_남의_항목이면_존재하지_않는다() {
        // given: 보관함 11(장소 2)은 회원 1의 것이다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 2L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then: 없는 id, 장소 id를 넣은 경우, 남의 항목 모두 false다
        assertAll(
                () -> assertThat(savedPlaceDao.existsByMemberAndId(1L, 999L)).isFalse(),
                () -> assertThat(savedPlaceDao.existsByMemberAndId(1L, 2L)).isFalse(),
                () -> assertThat(savedPlaceDao.existsByMemberAndId(2L, 11L)).isFalse()
        );
    }

    @Test
    void 보관함_행에_연결된_공유를_전부_읽고_남의_공유는_섞이지_않는다() {
        // given: 회원 1의 카페 온월(보관함 11)은 릴스 10의 공유 100과 102에서 저장했고, 회원 2는 같은 장소를 보관함 21로 공유 200에서 저장했다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, Instant.parse("2026-09-15T00:00:15Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 100L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-10T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 200L, 2L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-11T11:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 5L, 21L, 200L, Instant.parse("2026-09-11T13:00:00Z"));

        // when
        SavedPlaceMediaProjections media = savedPlaceDao.findMediaBySavedPlace(11L);

        // then
        assertThat(media.shares()).extracting(SavedPlaceMediaProjection::sharedMediaId)
                .containsExactlyInAnyOrder(100L, 102L);
    }

    @Test
    void 공유_열과_게시물_열이_모두_매핑된다() {
        // given
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 102L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when
        SavedPlaceMediaProjection media = savedPlaceDao.findMediaBySavedPlace(11L)
                .shares()
                .getFirst();

        // then
        assertAll(
                () -> assertThat(media.sharedMediaId()).isEqualTo(102L),
                () -> assertThat(media.mediaId()).isEqualTo(10L),
                () -> assertThat(media.thumbnailKey()).isEqualTo("reel10.jpg"),
                () -> assertThat(media.author()).isEqualTo("@seongsu_life"),
                () -> assertThat(media.caption()).isEqualTo("성수 카페 투어"),
                () -> assertThat(media.sharedUrl()).isEqualTo("https://www.instagram.com/reel/C1seongsu/"),
                () -> assertThat(media.createdAt()).isEqualTo(Instant.parse("2026-09-12T10:00:00Z"))
        );
    }

    @Test
    void 보관함에서_삭제하면_어느_공유에서_저장했는지도_함께_삭제된다() {
        // given: 회원 1이 릴스 10을 두 번(공유 100, 102) 공유해 카페 온월(장소 1)을 보관함 11로 두 공유에서 저장했다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 100L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-10T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when: 보관함 id(11)로 지운다. 장소 id(1)를 넣으면 지워지지 않아야 한다
        int deleted = savedPlaceDao.deleteByMemberAndIds(1L, List.of(11L));

        // then: saved_places를 지우면 shared_media_saved_places 행도 FK의 ON DELETE CASCADE로 사라진다
        assertAll(
                () -> assertThat(deleted).isEqualTo(1),
                () -> assertThat(savedPlaceDao.findAllByMember(1L)).isEmpty(),
                () -> assertThat(count("shared_media_saved_places WHERE saved_place_id = 11")).isZero()
        );
    }

    @Test
    void 보관함에서_삭제해도_공유_이력과_추출_결과와_장소는_남는다() {
        // given: 회원 1이 릴스 10을 두 번 공유했고(100, 102), 온월(장소 1)을 두 공유에서 저장했다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 24L, 2L, 1L, Instant.parse("2026-09-15T00:00:15Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 100L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-10T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertMediaPlace(jdbcTemplate, 1L, 10L, 1L);
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when
        savedPlaceDao.deleteByMemberAndIds(1L, List.of(11L));

        // then: shared_media, media_places, places와 다른 회원의 보관함은 그대로다
        assertAll(
                () -> assertThat(count("media_places WHERE media_id = 10 AND place_id = 1")).isEqualTo(1),
                () -> assertThat(count("shared_media WHERE member_id = 1")).isEqualTo(2),
                () -> assertThat(count("places WHERE id = 1")).isEqualTo(1),
                () -> assertThat(count("saved_places WHERE member_id = 2 AND place_id = 1")).isEqualTo(1)
        );
    }

    @Test
    void 없는_보관함이나_남의_보관함은_섞여_있어도_내_항목만_지운다() {
        // given: 보관함 11(장소 2), 12(장소 3)는 회원 1의 것이다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 2L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, 1L, 3L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, Instant.parse("2026-09-15T00:00:10Z"));

        // when: 내 항목 11, 없는 id 999, 장소 id 2, 남의 항목 21을 함께 보낸다
        int deleted = savedPlaceDao.deleteByMemberAndIds(1L, List.of(11L, 999L, 2L, 21L));

        // then: 내 항목 하나만 지워지고 나머지는 남는다
        assertAll(
                () -> assertThat(deleted).isEqualTo(1),
                () -> assertThat(count("saved_places WHERE id = 11")).isZero(),
                () -> assertThat(count("saved_places WHERE id = 12")).isEqualTo(1),
                () -> assertThat(count("saved_places WHERE id = 21")).isEqualTo(1)
        );
    }

    @Test
    void 장소의_관련_릴스에서_지운_공유는_빠진다() {
        // given: 보관함 11은 공유 100과 102에서 저장했고, 공유 100은 보관함에서 지웠다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 20L, "연남 와인바", "reel20.jpg", "@yeonnam");
        insertDeletedSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-09-10T10:00:00Z"),
                Instant.parse("2026-11-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 20L, Instant.parse("2026-09-12T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when
        SavedPlaceMediaProjections media = savedPlaceDao.findMediaBySavedPlace(11L);

        // then
        assertThat(media.shares()).extracting(SavedPlaceMediaProjection::sharedMediaId)
                .containsExactly(102L);
    }

    @Test
    void 지울_후보로_게시물의_공유에_연결된_장소를_한_번씩_읽는다() {
        // given: 회원 1은 게시물 10을 공유 100(지움)과 101로, 게시물 20을 공유 200으로 공유했고, 회원 2는 게시물 10을 공유 300으로 공유했다
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 20L, "연남 와인바", "reel20.jpg", "@yeonnam");
        insertDeletedSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-11-01T10:00:00Z"),
                Instant.parse("2026-11-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 101L, 1L, 10L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 200L, 1L, 20L, Instant.parse("2026-11-03T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 300L, 2L, 10L, Instant.parse("2026-11-04T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 13L, 1L, 3L, Instant.parse("2026-11-03T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 21L, 2L, 1L, Instant.parse("2026-11-04T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 12L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 3L, 12L, 101L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 4L, 13L, 200L, Instant.parse("2026-11-03T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 5L, 21L, 300L, Instant.parse("2026-11-04T10:00:00Z"));

        // when
        List<Long> placeIds = savedPlaceDao.findPlaceIdsByMemberAndMediaIds(1L, List.of(10L));

        // then: 지운 공유 100의 연결도 읽고, 두 공유에 연결된 장소 2는 한 번만, 다른 게시물의 장소 3과 회원 2의 보관함은 읽지 않는다
        assertThat(placeIds).containsExactly(1L, 2L);
    }

    @Test
    void 지울_후보로_게시물에서_추출된_장소도_보관함에_있으면_읽는다() {
        // given: 게시물 10에서 장소 1과 2가 추출됐고, 회원 1은 장소 1과 3을 다른 게시물 20의 공유 200에서만 저장했다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 20L, "연남 와인바", "reel20.jpg", "@yeonnam");
        insertMediaPlace(jdbcTemplate, 1L, 10L, 1L);
        insertMediaPlace(jdbcTemplate, 2L, 10L, 2L);
        insertSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 200L, 1L, 20L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 13L, 1L, 3L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 200L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 13L, 200L, Instant.parse("2026-11-02T10:00:00Z"));

        // when
        List<Long> placeIds = savedPlaceDao.findPlaceIdsByMemberAndMediaIds(1L, List.of(10L));

        // then: 게시물 10에서 나온 장소 1은 읽고, 보관함에 없는 장소 2와 게시물 10에서 나오지 않은 장소 3은 읽지 않는다
        assertThat(placeIds).containsExactly(1L);
    }

    @Test
    void 남은_공유와_연결된_장소는_지울_대상에서_빼고_폴더에_담긴_장소는_지울_대상에_넣는다() {
        // given: 장소 1, 2, 3을 지운 공유 100에서 저장했고, 장소 2는 남아 있는 공유 200에서도 저장했으며, 장소 3은 폴더 31에 담았다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 20L, "연남 와인바", "reel20.jpg", "@yeonnam");
        insertDeletedSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-11-01T10:00:00Z"),
                Instant.parse("2026-11-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 200L, 1L, 20L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 13L, 1L, 3L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 12L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 3L, 12L, 200L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 4L, 13L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertFolder(jdbcTemplate, 31L, 1L, "데이트", "RED");
        insertFolderSavedPlace(jdbcTemplate, 1L, 31L, 13L);

        // when
        List<Long> unusedIds = savedPlaceDao.findUnusedIdsByMemberAndPlaceIds(1L, List.of(1L, 2L, 3L));

        // then: 장소 1(보관함 11)과 폴더에 담은 장소 3(보관함 13)은 읽고, 공유 200에서도 저장한 장소 2(보관함 12)는 읽지 않는다
        assertThat(unusedIds).containsExactly(11L, 13L);
    }

    @Test
    void 분석에_성공한_남은_게시글에_있는_장소는_공유_연결이_없어도_지울_대상에서_뺀다() {
        // given: 장소 1과 2를 지운 공유 100에서만 저장했고, 장소 2는 남은 성공 공유 200의 게시물 20에서도 추출됐다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 20L, "연남 와인바", "reel20.jpg", "@yeonnam");
        insertMediaPlace(jdbcTemplate, 1L, 20L, 2L);
        insertDeletedSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-11-01T10:00:00Z"),
                Instant.parse("2026-11-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 200L, 1L, 20L, Instant.parse("2026-11-02T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, 1L, 2L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 12L, 100L, Instant.parse("2026-11-01T10:00:00Z"));

        // when
        List<Long> unusedIds = savedPlaceDao.findUnusedIdsByMemberAndPlaceIds(1L, List.of(1L, 2L));

        // then: 게시물 20의 상세에 체크로 보이는 장소 2(보관함 12)는 빼고, 장소 1(보관함 11)만 읽는다
        assertThat(unusedIds).containsExactly(11L);
    }

    @Test
    void 분석에_실패한_남은_게시글에서_추출된_장소는_지울_대상에서_빼지_않는다() {
        // given: 장소 3을 지운 공유 100에서만 저장했고, 장소 3은 분석에 실패한 내 공유 300의 게시물 30에서도 추출됐다
        insertMember(1L, "user-1");
        insertThreePlaces();
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertMedia(jdbcTemplate, 30L, "망원 빵집", "reel30.jpg", "@mangwon");
        insertMediaPlace(jdbcTemplate, 1L, 30L, 3L);
        insertDeletedSharedMedia(jdbcTemplate, 100L, 1L, 10L, Instant.parse("2026-11-01T10:00:00Z"),
                Instant.parse("2026-11-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 300L, 1L, 30L, Instant.parse("2026-11-03T10:00:00Z"), new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.PROCESSING_FAILED, 1, MediaSourceType.EXTRACTED));
        insertSavedPlace(jdbcTemplate, 13L, 1L, 3L, Instant.parse("2026-11-01T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 13L, 100L, Instant.parse("2026-11-01T10:00:00Z"));

        // when
        List<Long> unusedIds = savedPlaceDao.findUnusedIdsByMemberAndPlaceIds(1L, List.of(3L));

        // then: 실패한 게시글은 게시물 탭에 나오지 않아 체크가 보이지 않으므로, 장소 3(보관함 13)을 읽는다
        assertThat(unusedIds).containsExactly(13L);
    }

    private Long readSavedPlaceId(Long memberId, Long placeId) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM saved_places WHERE member_id = ? AND place_id = ?", Long.class, memberId, placeId);
    }

    private Instant readSavedAt(Long savedPlaceId) {
        return jdbcTemplate.queryForObject(
                "SELECT last_saved_at FROM saved_places WHERE id = ?", Timestamp.class, savedPlaceId).toInstant();
    }

    private Instant readShareSavedAt(Long savedPlaceId, Long sharedMediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT created_at
                FROM shared_media_saved_places
                WHERE saved_place_id = ? AND shared_media_id = ?
                """, Timestamp.class, savedPlaceId, sharedMediaId).toInstant();
    }

    private int count(String fromWhere) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + fromWhere, Integer.class);
    }

    private void insertMember(Long memberId, String providerUserId) {
        insertKakaoMember(jdbcTemplate, memberId, providerUserId, "kakao-" + providerUserId,
                providerUserId + "@example.com", null);
    }

    private void insertThreePlaces() {
        insertPlaceWithEveryColumnFilled();
        insertPlaceWithOptionalColumnsNull();
        insertPlace(jdbcTemplate, 3L, "kakao-3", "경복궁", "관광명소", "서울 종로구 세종로 1-1", "서울 종로구 사직로 161",
                new BigDecimal("37.5796"), new BigDecimal("126.9770"), "https://place.map.kakao.com/3", null,
                "https://img.example.com/3.jpg", "KAKAO");
    }

    /**
     * 카페 온월. 열 전부가 채워진 장소이고 구글 사진이다.
     */
    private void insertPlaceWithEveryColumnFilled() {
        insertPlace(jdbcTemplate, 1L, "kakao-1", "카페 온월", "음식점 > 카페", "서울 성동구 성수동2가 289-10",
                "서울 성동구 성수이로 26 2층", new BigDecimal("37.5445"), new BigDecimal("127.0561"),
                "https://place.map.kakao.com/1", "02-1234-5678", "https://img.example.com/1.jpg", "GOOGLE");
    }

    /**
     * 윤숲 후르츠산도. 비어 있을 수 있는 열이 전부 NULL인 장소다.
     */
    private void insertPlaceWithOptionalColumnsNull() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 2L, "kakao-2", "윤숲 후르츠산도", "서울 광진구 화양동 1-1",
                new BigDecimal("37.5400"), new BigDecimal("127.0700"));
    }
}
