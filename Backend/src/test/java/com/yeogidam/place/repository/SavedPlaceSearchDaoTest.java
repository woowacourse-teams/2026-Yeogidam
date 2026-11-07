package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.place.domain.SearchQuery;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(SavedPlaceDao.class)
class SavedPlaceSearchDaoTest extends JdbcTestSupport {

    private static final Long MEMBER_ID = 1L;
    private static final Instant SAVED_AT = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private SavedPlaceDao savedPlaceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "place-search-owner", "검색 회원", null, null);
    }

    @Test
    void 검색한_모든_단어가_주소나_카테고리_또는_장소명에_포함된_장소만_반환한다() {
        // given
        savePlace(1L, "어니언", "음식점 > 카페", "서울 성동구 성수동2가 1-1", "서울 성동구 아차산로 1");
        savePlace(2L, "소문난집", "음식점 > 한식", "서울 성동구 성수동2가 2-2", "서울 성동구 아차산로 2");
        savePlace(3L, "레이크", "음식점 > 카페", "서울 송파구 잠실동 3-3", "서울 송파구 올림픽로 3");

        // when
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(
                MEMBER_ID, new SearchQuery("성수 카페"), savedPlaceDao.findCategoriesByMember(MEMBER_ID));

        // then
        assertThat(places.places())
                .extracting(SavedPlaceProjection::name)
                .containsExactly("어니언");
    }

    @Test
    void 실제_영문_상호의_대소문자와_공백이_달라도_찾는다() {
        // given
        savePlace(1L, "Blue Bottle Coffee", "음식점 > 카페", "서울 성동구 성수동1가 1-1", "서울 성동구 아차산로 7");
        savePlace(2L, "어니언 성수", "음식점 > 카페", "서울 성동구 성수동2가 2-2", null);

        // when
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(
                MEMBER_ID, new SearchQuery("  bluebottlecoffee  "), savedPlaceDao.findCategoriesByMember(MEMBER_ID));

        // then
        assertThat(places.places())
                .extracting(SavedPlaceProjection::name)
                .containsExactly("Blue Bottle Coffee");
    }

    @Test
    void 퍼센트와_밑줄은_다른_글자를_대신하는_패턴으로_쓰지_않는다() {
        // given
        savePlace(1L, "100%_카페", null, "서울 성동구 성수동1가 1-1", null);
        savePlace(2L, "100XYZ_카페", null, "서울 성동구 성수동1가 2-2", null);
        savePlace(3L, "100%X카페", null, "서울 성동구 성수동1가 3-3", null);

        // when
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(
                MEMBER_ID, new SearchQuery("100%_카페"), savedPlaceDao.findCategoriesByMember(MEMBER_ID));

        // then
        assertThat(places.places())
                .extracting(SavedPlaceProjection::name)
                .containsExactly("100%_카페");
    }

    @Test
    void 검색어가_지번이나_도로명에_포함된_장소를_모두_찾는다() {
        // given: 지번에만 일치하는 장소는 도로명과 카테고리가 null이다.
        savePlace(1L, "첫 번째 가게", null, "서울 송파구 잠실동 1-1", null);
        savePlace(2L, "두 번째 가게", "음식점 > 카페", "서울 송파구 신천동 2-2", "서울 송파구 잠실로 2");
        savePlace(3L, "골목 가게", "음식점 > 카페", "서울 송파구 신천동 3-3", "서울 송파구 잠실로12길 3");
        savePlace(4L, "다른 가게", "음식점 > 한식", "서울 강남구 역삼동 4-4", "서울 강남구 테헤란로 4");

        // when
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(
                MEMBER_ID, new SearchQuery("잠실"), savedPlaceDao.findCategoriesByMember(MEMBER_ID));

        // then
        assertThat(places.savedPlaceIds())
                .containsExactlyInAnyOrder(101L, 102L, 103L);
    }

    @Test
    void 내_검색_결과를_건수_제한_없이_저장_시각과_ID_내림차순으로_반환한다() {
        // given: 먼저 저장한 100개는 같은 시각이며, 가장 최근에 저장한 장소의 ID는 더 작다.
        insertKakaoMember(jdbcTemplate, 2L, "place-search-other", "다른 회원", null, null);
        for (long id = 1; id <= 100; id++) {
            insertSearchPlace(id);
            insertSavedPlace(jdbcTemplate, 1_000L + id, MEMBER_ID, id, SAVED_AT);
        }
        insertSearchPlace(101L);
        insertSavedPlace(jdbcTemplate, 500L, MEMBER_ID, 101L, SAVED_AT.plusSeconds(1));
        insertSavedPlace(jdbcTemplate, 9_999L, 2L, 101L, SAVED_AT.plusSeconds(2));
        List<Long> expectedIds = new ArrayList<>(List.of(500L));
        for (long id = 1_100; id >= 1_001; id--) {
            expectedIds.add(id);
        }

        // when
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(
                MEMBER_ID, new SearchQuery("성수"), savedPlaceDao.findCategoriesByMember(MEMBER_ID));

        // then
        assertThat(places.savedPlaceIds())
                .containsExactlyElementsOf(expectedIds);
    }

    @Test
    void 카테고리_분류에는_내가_저장한_장소만_포함한다() {
        // given
        savePlace(1L, "첫 번째 가게", "음식점 > 간식", "서울 성동구 성수동2가 1-1", null);
        insertKakaoMember(jdbcTemplate, 2L, "category-search-other", "다른 회원", null, null);
        insertSavedPlace(jdbcTemplate, 9_999L, 2L, 1L, SAVED_AT);

        // when
        SavedPlaceCategoryProjections categories = savedPlaceDao.findCategoriesByMember(MEMBER_ID);

        // then
        assertThat(categories.savedPlaceIdsMatching("디저트"))
                .containsExactly(101L);
    }

    @Test
    void 검색된_저장_장소의_폴더_연결만_담은_순서대로_반환한다() {
        // given
        savePlace(1L, "첫 번째 가게", null, "서울 성동구 성수동2가 1-1", null);
        savePlace(2L, "두 번째 가게", null, "서울 성동구 성수동2가 2-2", null);
        savePlace(3L, "세 번째 가게", null, "서울 성동구 성수동2가 3-3", null);
        insertFolder(jdbcTemplate, 7L, MEMBER_ID, "가고 싶은 곳", "RED", SAVED_AT);
        insertFolder(jdbcTemplate, 8L, MEMBER_ID, "좋아하는 곳", "GREEN", SAVED_AT);
        insertFolder(jdbcTemplate, 9L, MEMBER_ID, "다시 갈 곳", "YELLOW", SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 1L, 7L, 101L, SAVED_AT.plusSeconds(1));
        insertFolderSavedPlace(jdbcTemplate, 2L, 8L, 101L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 3L, 9L, 101L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 4L, 7L, 102L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 5L, 9L, 103L, SAVED_AT);

        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMemberAndSavedPlaceIds(
                MEMBER_ID, List.of(101L, 103L));

        // then
        assertAll(
                () -> assertThat(folders.folderIdsOf(101L))
                        .containsExactly(8L, 9L, 7L),
                () -> assertThat(folders.folderIdsOf(103L))
                        .containsExactly(9L),
                () -> assertThat(folders.folderIdsOf(102L))
                        .isEmpty()
        );
    }

    @Test
    void 요청한_ID에_다른_회원의_저장_장소가_있어도_내_폴더와_내_장소의_연결만_반환한다() {
        // given: 폴더와 저장 장소의 소유 회원이 다른 연결도 조회에서 제외한다.
        savePlace(1L, "첫 번째 가게", null, "서울 성동구 성수동2가 1-1", null);
        insertKakaoMember(jdbcTemplate, 2L, "folder-search-other", "다른 회원", null, null);
        insertSavedPlace(jdbcTemplate, 201L, 2L, 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 7L, MEMBER_ID, "내 폴더", "RED", SAVED_AT);
        insertFolder(jdbcTemplate, 8L, 2L, "다른 회원 폴더", "GREEN", SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 1L, 7L, 101L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 2L, 8L, 101L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 3L, 7L, 201L, SAVED_AT);
        insertFolderSavedPlace(jdbcTemplate, 4L, 8L, 201L, SAVED_AT);

        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMemberAndSavedPlaceIds(
                MEMBER_ID, List.of(101L, 201L));

        // then
        assertAll(
                () -> assertThat(folders.folderIdsOf(101L))
                        .containsExactly(7L),
                () -> assertThat(folders.folderIdsOf(201L))
                        .isEmpty()
        );
    }

    @Test
    void 조회할_저장_장소_ID가_없으면_빈_폴더_연결을_반환한다() {
        // when
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMemberAndSavedPlaceIds(
                MEMBER_ID, List.of());

        // then
        assertThat(folders.folderIdsOf(101L))
                .isEmpty();
    }

    private void insertSearchPlace(Long placeId) {
        insertPlace(jdbcTemplate, placeId, "kakao-search-" + placeId, "가게 " + placeId, null,
                "서울 성동구 성수동1가 " + placeId, null, new BigDecimal("37.5445"),
                new BigDecimal("127.0560"), null, null, null, null);
    }

    private void savePlace(
            Long placeId,
            String name,
            String category,
            String landLotAddress,
            String roadAddress
    ) {
        insertPlace(jdbcTemplate, placeId, "kakao-search-" + placeId, name, category, landLotAddress, roadAddress,
                new BigDecimal("37.5445"), new BigDecimal("127.0560"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 100L + placeId, MEMBER_ID, placeId, SAVED_AT);
    }
}
