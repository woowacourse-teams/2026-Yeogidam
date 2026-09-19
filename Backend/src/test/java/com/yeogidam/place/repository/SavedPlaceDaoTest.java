package com.yeogidam.place.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

/**
 * 보관함 조회 쿼리의 조인, 정렬, 열 매핑이 실제 MySQL에서 동작하는지 검증한다.
 */
@Import(SavedPlaceDao.class)
@Sql({"/members.sql", "/places.sql", "/saved-places.sql"})
class SavedPlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private SavedPlaceDao savedPlaceDao;

    @Test
    void 회원의_보관함을_최근_저장_순으로_읽는다() {
        // when
        List<SavedPlaceProjection> savedPlaces = savedPlaceDao.findAllByMember(1L);

        // then
        assertThat(savedPlaces).extracting(SavedPlaceProjection::placeId)
                .containsExactly(3L, 2L, 1L);
    }

    @Test
    void 장소_열과_저장_시각이_모두_매핑된다() {
        // when
        SavedPlaceProjection savedPlace = savedPlaceDao.findAllByMember(1L).getLast();

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
    void 값이_없는_열은_null로_매핑된다() {
        // when
        SavedPlaceProjection savedPlace = savedPlaceDao.findAllByMember(1L).get(1);

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
        assertThat(savedPlaceDao.findAllByMember(2L)).extracting(SavedPlaceProjection::placeId)
                .containsExactly(1L);
    }

    @Test
    void 저장한_장소가_없으면_빈_목록이다() {
        assertThat(savedPlaceDao.findAllByMember(999L)).isEmpty();
    }
}
