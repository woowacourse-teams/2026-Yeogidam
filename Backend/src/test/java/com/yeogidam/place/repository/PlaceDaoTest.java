package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.CountryCode;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceDao.class)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
class PlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceDao placeDao;

    @Test
    void 장소_상세_목록은_공유와_게시물_정보를_빠짐없이_읽는다() {
        // given: 게시물 21에서 장소 1이 추출됐고, 회원 31이 게시물 21을 공유했다
        insertMemberAndPlace(31L);
        insertMedia(jdbcTemplate, 21L, "성수 카페 모음", "21.jpg", "@seongsu");
        insertMediaPlace(jdbcTemplate, 21L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, Instant.parse("2026-11-01T10:00:00.123456Z"));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares).containsExactly(new PlaceMediaProjection(
                1L,
                "21.jpg",
                "@seongsu",
                "성수 카페 모음",
                "https://www.instagram.com/reel/fixture-1/",
                Instant.parse("2026-11-01T10:00:00.123456Z")
        ));
    }

    @Test
    void 장소_상세_목록은_해당_장소가_추출된_게시물의_공유만_읽는다() {
        // given: 게시물 21에서는 장소 1이, 게시물 22에서는 장소 2만 추출됐고 회원 31이 두 게시물을 모두 공유했다
        insertMemberAndPlace(31L);
        insertPlaceOnly(2L);
        insertMediaWithPlace(21L);
        insertMedia(jdbcTemplate, 22L, "게시물 22", "22.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 22L, 22L, 2L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 장소_상세_목록에_다른_회원의_공유는_섞이지_않는다() {
        // given: 회원 31이 게시물 21을 공유 1로 공유한 뒤 회원 32가 같은 게시물을 공유 2로 공유했다
        insertMemberAndPlace(31L);
        insertKakaoMember(jdbcTemplate, 32L, "place-media-other", null, null, null);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 32L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 내_공유가_실패했으면_다른_회원의_공유로_게시물_추출이_성공해도_장소_상세_목록에서_빠진다() {
        // given: 회원 31의 공유 1은 분석에 실패했고, 나중에 회원 32의 공유 2로 게시물 21의 추출이 성공해 장소 1이 나왔다
        insertMemberAndPlace(31L);
        insertKakaoMember(jdbcTemplate, 32L, "place-media-other", null, null, null);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base, new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.PROCESSING_FAILED, 1, MediaSourceType.EXTRACTED));
        insertSharedMedia(jdbcTemplate, 2L, 32L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares).isEmpty();
    }

    @Test
    void 같은_게시물을_다시_공유했으면_장소_상세_목록에_가장_최근_공유_한_건만_나온다() {
        // given: 회원 31이 게시물 21을 공유 1, 2로 두 번 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록은_게시물을_가장_최근에_공유한_순서로_정렬한다() {
        // given: 게시물 21을 공유 1로, 게시물 22를 공유 2로 차례로 공유한 뒤 게시물 21을 공유 3으로 다시 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 31L, 21L, base.plusSeconds(2));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(3L, 2L);
    }

    @Test
    void 장소_상세_목록은_ID보다_공유_시각을_먼저_보고_정렬한다() {
        // given: 게시물 21은 공유 10으로 10-05에, 게시물 22는 공유 9로 10-06에 공유해서 ID 순서와 공유 시각 순서가 반대다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        insertSharedMedia(jdbcTemplate, 10L, 31L, 21L, Instant.parse("2026-10-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 9L, 31L, 22L, Instant.parse("2026-10-06T10:00:00Z"));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then: ID가 작아도 공유 시각이 늦은 공유 9가 앞에 온다
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(9L, 10L);
    }

    @Test
    void 장소_상세_목록은_공유_시각이_같으면_ID가_큰_공유를_남긴다() {
        // given: 회원 31이 게시물 21을 같은 시각에 공유 1, 2로 두 번 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant sameTime = Instant.parse("2026-11-05T10:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, sameTime);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록에서_지운_공유는_빠진다() {
        // given: 게시물 21의 공유 1은 지웠고 게시물 22의 공유 2는 남아 있으며, 두 게시물 모두 장소 1이 추출됐다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 31L, 21L, base.plusSeconds(1), base.plusSeconds(10));
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록은_공유_시각이_같은_게시물을_ID가_큰_공유부터_정렬한다() {
        // given: 게시물 21, 22, 23을 같은 시각에 공유 1, 2, 3으로 한 번씩 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        insertMediaWithPlace(23L);
        Instant sameTime = Instant.parse("2026-11-05T10:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, sameTime);
        insertSharedMedia(jdbcTemplate, 3L, 31L, 23L, sameTime);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(3L, 2L, 1L);
    }

    @Test
    void 장소_상세_목록은_ID가_작아도_공유_시각이_늦은_공유를_남긴다() {
        // given: 게시물 21의 공유 1은 공유 2보다 ID가 작지만 공유 시각은 1초 늦다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, base);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 영업시간과_메뉴는_보관함이나_공유와_관계없이_장소_ID로_읽는다() {
        // given: 장소 1은 누구의 보관함에도 없고 어떤 게시물에서도 추출되지 않았다
        insertPlaceOnly(1L);
        updatePlaceInfo(1L, """
                [{"dayOfWeek":"SUNDAY","periods":[]},
                 {"dayOfWeek":"MONDAY","periods":[{"opensAt":"18:00","closesAt":"02:00"}]}]
                """, """
                [{"name":"아메리카노","price":4500}]
                """);

        // when
        PlaceInfoProjection info = placeDao.findInfoById(1L).orElseThrow();

        // then
        assertThat(info.openingHours())
                .extracting(PlaceInfoProjection.OpeningDay::dayOfWeek)
                .containsExactly(DayOfWeek.MONDAY, DayOfWeek.SUNDAY);
        assertThat(info.menus())
                .containsExactly(new PlaceInfoProjection.Menu("아메리카노", 4500));
    }

    @Test
    void 없는_장소의_영업시간과_메뉴는_읽지_않는다() {
        assertThat(placeDao.findInfoById(1L)).isEmpty();
    }

    @Test
    void 같은_요일이_두_번_있는_영업시간은_정보_없음으로_읽고_메뉴는_그대로_읽는다() {
        // given
        insertPlaceOnly(1L);
        updatePlaceInfo(1L, """
                [{"dayOfWeek":"MONDAY","periods":[{"opensAt":"11:00","closesAt":"15:00"}]},
                 {"dayOfWeek":"MONDAY","periods":[{"opensAt":"17:00","closesAt":"21:00"}]}]
                """, """
                [{"name":"아메리카노","price":4500}]
                """);

        // when
        PlaceInfoProjection info = placeDao.findInfoById(1L).orElseThrow();

        // then
        assertThat(info.openingHours()).isNull();
        assertThat(info.menus()).hasSize(1);
    }

    @Test
    void 가격에_소수점이_있는_메뉴는_정보_없음으로_읽는다() {
        // given
        insertPlaceOnly(1L);
        updatePlaceInfo(1L, null, """
                [{"name":"아메리카노","price":4500.7}]
                """);

        // when
        PlaceInfoProjection info = placeDao.findInfoById(1L).orElseThrow();

        // then
        assertThat(info.menus()).isNull();
    }

    @Test
    void 카카오_장소는_지도_제공자와_장소_ID와_함께_kakao_place_id도_넣는다() {
        // when
        Long placeId = placeDao.saveIfAbsent(kakaoPlace("26338954"));

        // then
        assertThat(jdbcTemplate.queryForMap("""
                SELECT map_provider, external_place_id, country_code, kakao_place_id FROM places WHERE id = ?
                """, placeId))
                .containsEntry("map_provider", "KAKAO")
                .containsEntry("external_place_id", "26338954")
                .containsEntry("country_code", "KR")
                .containsEntry("kakao_place_id", "26338954");
    }

    @Test
    void 구글_장소는_지도_제공자와_나라를_넣고_kakao_place_id와_카카오_링크는_비운다() {
        // when
        Long placeId = placeDao.saveIfAbsent(googlePlace("ChIJxwgCUhPnAGARoz8_83liVEk"));

        // then
        assertThat(jdbcTemplate.queryForMap("""
                SELECT map_provider, external_place_id, country_code, kakao_place_id, kakao_place_url
                FROM places WHERE id = ?
                """, placeId))
                .containsEntry("map_provider", "GOOGLE")
                .containsEntry("external_place_id", "ChIJxwgCUhPnAGARoz8_83liVEk")
                .containsEntry("country_code", "JP")
                .containsEntry("kakao_place_id", null)
                .containsEntry("kakao_place_url", null);
    }

    @Test
    void 같은_구글_장소를_다시_저장하면_새_줄을_만들지_않고_같은_장소_ID를_돌려준다() {
        // given
        Long first = placeDao.saveIfAbsent(googlePlace("ChIJxwgCUhPnAGARoz8_83liVEk"));

        // when
        Long second = placeDao.saveIfAbsent(googlePlace("ChIJxwgCUhPnAGARoz8_83liVEk"));

        // then
        assertThat(second).isEqualTo(first);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM places", Long.class)).isEqualTo(1L);
    }

    @Test
    void 카카오_장소_ID와_글자가_같은_구글_장소는_다른_장소로_저장한다() {
        // given
        Long kakaoPlaceId = placeDao.saveIfAbsent(kakaoPlace("26338954"));

        // when
        Long googlePlaceId = placeDao.saveIfAbsent(googlePlace("26338954"));

        // then
        assertThat(googlePlaceId).isNotEqualTo(kakaoPlaceId);
    }

    @Test
    void 구글_장소_ID는_대소문자를_가려서_대소문자만_다른_ID는_다른_장소로_저장한다() {
        // given
        Long lowerCasePlaceId = placeDao.saveIfAbsent(googlePlace("ChIJabcdefg"));

        // when
        Long upperCasePlaceId = placeDao.saveIfAbsent(googlePlace("ChIJABCDEFG"));

        // then
        assertThat(upperCasePlaceId).isNotEqualTo(lowerCasePlaceId);
    }

    @Test
    void 이전_서버가_kakao_place_id만_넣은_장소를_다시_저장하면_같은_장소_ID를_돌려준다() {
        // given: 배포 동안 V7 컬럼을 모르는 이전 서버가 kakao_place_id만 넣었다.
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 71L, "26338954", "카페 온월", "서울 성동구 성수동2가 289-10",
                new BigDecimal("37.5445"), new BigDecimal("127.0561"));

        // when
        Long placeId = placeDao.saveIfAbsent(kakaoPlace("26338954"));

        // then
        assertThat(placeId).isEqualTo(71L);
    }

    private Place kakaoPlace(String kakaoPlaceId) {
        return new Place(null, PlaceExternalSource.kakao(kakaoPlaceId, "https://place.map.kakao.com/" + kakaoPlaceId),
                new PlaceProfile(new PlaceName("카페 온월"), new Address("서울 성동구 성수동2가 289-10", null),
                        new Coordinate(new BigDecimal("37.5445"), new BigDecimal("127.0561")), "음식점 > 카페",
                        null, null));
    }

    private Place googlePlace(String googlePlaceId) {
        return new Place(null, PlaceExternalSource.google(googlePlaceId),
                new PlaceProfile(new PlaceName("토미타 규카츠"), new Address("Osaka", null, new CountryCode("JP")),
                        new Coordinate(new BigDecimal("34.6630"), new BigDecimal("135.5020")), "음식점 > 일식",
                        null, null));
    }

    private void updatePlaceInfo(Long placeId, String openingHours, String menus) {
        jdbcTemplate.update("""
                UPDATE places
                SET opening_hours = ?, menus = ?
                WHERE id = ?
                """, openingHours, menus, placeId);
    }

    /**
     * 장소 상세 목록 테스트의 회원과, 게시물에서 추출될 장소 1을 함께 넣는다. 장소는 보관함에 저장하지 않는다.
     */
    private void insertMemberAndPlace(Long memberId) {
        insertKakaoMember(jdbcTemplate, memberId, "place-media-owner-" + memberId, null, null, null);
        insertPlaceOnly(1L);
    }

    /**
     * 보관함에 저장하지 않은 장소만 넣는다.
     */
    private void insertPlaceOnly(Long placeId) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, placeId, "place-media-" + placeId, "성수 카페",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
    }

    /**
     * 게시물을 넣고 장소 1이 추출된 것으로 둔다. 추출 결과 ID는 게시물 ID와 같게 둔다.
     */
    private void insertMediaWithPlace(Long mediaId) {
        insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
        insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
    }
}
