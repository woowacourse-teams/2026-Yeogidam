package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSavedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSupersededCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보관함 조회 쿼리의 조인, 정렬, 열 매핑과 삭제의 범위, 관련 릴스 조회의 조인과 열 매핑이 실제 MySQL에서 동작하는지 검증한다. 행은 SQL fixture로 given에서 직접 넣는다.
 */
@Import(SavedPlaceDao.class)
class SavedPlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private SavedPlaceDao savedPlaceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 보관함을_최근에_저장한_순서로_읽는다() {
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
    void 장소_정보와_저장_시각이_빠짐없이_매핑된다() {
        // given
        insertMember(1L, "user-1");
        insertPlaceWithEveryColumnFilled();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));

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
                () -> assertThat(savedPlace.thumbnailUrl()).isEqualTo("https://img.example.com/1.jpg"),
                () -> assertThat(savedPlace.thumbnailSource()).isEqualTo("GOOGLE"),
                () -> assertThat(savedPlace.thumbnailAttribution())
                        .isEqualTo("<a href=\"https://maps.google.com/maps/contrib/1\">작성자</a>"),
                () -> assertThat(savedPlace.lastSavedAt()).isEqualTo(Instant.parse("2026-09-15T00:00:00Z"))
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
                () -> assertThat(savedPlace.thumbnailUrl()).isNull(),
                () -> assertThat(savedPlace.thumbnailSource()).isNull(),
                () -> assertThat(savedPlace.thumbnailAttribution()).isNull()
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
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "https://img.example.com/reel10.jpg", "@seongsu_life");
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
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "https://img.example.com/reel10.jpg", "@seongsu_life");
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
                () -> assertThat(media.thumbnailUrl()).isEqualTo("https://img.example.com/reel10.jpg"),
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
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "https://img.example.com/reel10.jpg", "@seongsu_life");
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
    void 보관함에서_삭제해도_공유_이력과_공유_건마다의_결정_기록과_장소는_남는다() {
        // given: 회원 1이 릴스 10을 두 번 공유했고(100, 102) 첫 공유의 윤숲 후보는 재공유로 SUPERSEDED, 온월은 두 번 다 SAVED
        insertMember(1L, "user-1");
        insertMember(2L, "user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 24L, 2L, 1L, Instant.parse("2026-09-15T00:00:15Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "https://img.example.com/reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 100L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-10T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, 1L, 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertSavedCandidate(jdbcTemplate, 1000L, 100L, 1L, Timestamp.valueOf("2026-09-10 12:00:00"));
        insertSupersededCandidate(jdbcTemplate, 1001L, 100L, 2L);
        insertSavedCandidate(jdbcTemplate, 1003L, 102L, 1L, Timestamp.valueOf("2026-09-12 12:00:00"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when
        savedPlaceDao.deleteByMemberAndIds(1L, List.of(11L));

        // then: shared_media, place_candidates, places와 다른 회원의 보관함은 그대로다
        assertAll(
                () -> assertThat(count("place_candidates WHERE place_id = 1")).isEqualTo(2),
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
                "https://img.example.com/3.jpg", "KAKAO", null);
    }

    /**
     * 카페 온월. 열 전부가 채워진 장소이고 구글 사진이라 출처 표기가 있다.
     */
    private void insertPlaceWithEveryColumnFilled() {
        insertPlace(jdbcTemplate, 1L, "kakao-1", "카페 온월", "음식점 > 카페", "서울 성동구 성수동2가 289-10",
                "서울 성동구 성수이로 26 2층", new BigDecimal("37.5445"), new BigDecimal("127.0561"),
                "https://place.map.kakao.com/1", "02-1234-5678", "https://img.example.com/1.jpg", "GOOGLE",
                "<a href=\"https://maps.google.com/maps/contrib/1\">작성자</a>");
    }

    /**
     * 윤숲 후르츠산도. 비어 있을 수 있는 열이 전부 NULL인 장소다.
     */
    private void insertPlaceWithOptionalColumnsNull() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 2L, "kakao-2", "윤숲 후르츠산도", "서울 광진구 화양동 1-1",
                new BigDecimal("37.5400"), new BigDecimal("127.0700"));
    }
}
