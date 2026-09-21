package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보관함 조회 쿼리의 조인, 정렬, 열 매핑이 실제 MySQL에서 동작하는지 검증한다. 행은 SQL fixture로 given에서 직접 넣는다.
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
        insertSavedPlace(jdbcTemplate, 1L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 2L, 1L, 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 3L, 1L, 3L, Instant.parse("2026-09-15T00:00:10Z"));

        // when
        List<SavedPlaceProjection> savedPlaces = savedPlaceDao.findAllByMember(1L);

        // then
        assertThat(savedPlaces).extracting(SavedPlaceProjection::placeId)
                .containsExactly(3L, 2L, 1L);
    }

    @Test
    void 장소_정보와_저장_시각이_빠짐없이_매핑된다() {
        // given
        insertMember(1L, "user-1");
        insertPlaceWithEveryColumnFilled();
        insertSavedPlace(jdbcTemplate, 1L, 1L, 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when
        SavedPlaceProjection savedPlace = savedPlaceDao.findAllByMember(1L).getFirst();

        // then
        assertAll(
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
