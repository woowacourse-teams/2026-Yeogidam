package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.insertReport;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.yeogidam.search.repository.SearchQuery;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(SharedMediaDao.class)
class SharedMediaSearchDaoTest extends JdbcTestSupport {

    private static final Long MEMBER_ID = 1L;
    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private SharedMediaDao sharedMediaDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "media-search-owner", null, null, null);
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-media-search", "성수 카페", "서울 성동구 성수동",
                new BigDecimal("37.5445"), new BigDecimal("127.0560"));
    }

    @Test
    void 최신_60개가_비일치해도_오래된_캡션_전체에서_모든_검색어를_찾는다() {
        // given: 장소명과 작성자는 일치하지만 캡션에 두 단어가 모두 있는 게시글은 오래된 한 건뿐이다.
        List<String> captions = List.of("성수 식당", "잠실 카페", "다른 동네 이야기");
        for (long id = 1; id <= 60; id++) {
            insertSearchableMedia(id, captions.get((int) (id % captions.size())));
            insertSharedMedia(jdbcTemplate, id, MEMBER_ID, id, BASE.plusSeconds(id));
        }
        insertSearchableMedia(100L, "오래전에 공유한 게시글\n성수 카페 모음");
        insertSharedMedia(jdbcTemplate, 100L, MEMBER_ID, 100L, BASE.minusSeconds(1));

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new SearchQuery("성수 카페"));

        // then
        assertThat(shares.shares())
                .containsExactly(new SavedMediaProjection(100L, 100L, BASE.minusSeconds(1), "search-100.jpg",
                        "오래전에 공유한 게시글\n성수 카페 모음", "성수 카페", "https://www.instagram.com/reel/fixture-100/", false));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 첫_페이지와_커서_조회_모두_대표_공유의_제보_여부를_읽는다(boolean withCursor) {
        // given: 공유 1과 2를 제보했고, 공유 2와 같은 게시글을 공유 3으로 다시 공유했다.
        insertSearchableMedia(1L, "성수 카페");
        insertSearchableMedia(2L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, MEMBER_ID, 2L, BASE);
        insertSharedMedia(jdbcTemplate, 3L, MEMBER_ID, 2L, BASE.plusSeconds(1));
        insertReport(jdbcTemplate, 1L, 1L, BASE.plusSeconds(2));
        insertReport(jdbcTemplate, 2L, 2L, BASE.plusSeconds(2));

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId, SavedMediaProjection::reported)
                .containsExactly(tuple(3L, false), tuple(1L, true));
    }

    @Test
    void 커서_이후에도_모든_검색_단어가_캡션에_포함된_게시글만_반환한다() {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertSearchableMedia(2L, "성수 식당");
        insertSearchableMedia(3L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE.minusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, MEMBER_ID, 2L, BASE);
        insertSharedMedia(jdbcTemplate, 3L, MEMBER_ID, 3L, BASE.plusSeconds(1));

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQueryBefore(
                MEMBER_ID, new SearchQuery("성수 카페"), new SharedMediaCursor(BASE.plusSeconds(1), 3L));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"bluebottlecoffee", "BLUE BOTTLE", "  blue\tbottle\ncoffee  "})
    void 영문_대소문자와_스페이스_탭_줄바꿈_차이를_허용한다(String query) {
        // given
        insertSearchableMedia(1L, "Blue \tBottle\r\n Coffee");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new SearchQuery(query));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::caption)
                .containsExactly("Blue \tBottle\r\n Coffee");
    }

    @ParameterizedTest
    @ValueSource(strings = {"100%_!", "' OR 1=1 --"})
    void 검색어의_특수문자를_SQL_패턴이나_구문이_아닌_문자로_검색한다(String query) {
        // given
        insertSearchableMedia(1L, "행사 " + query);
        insertSearchableMedia(2L, "행사 100XYZ_!");
        insertSearchableMedia(3L, "행사 100%X!");
        insertSearchableMedia(4L, "행사 100%_");
        for (long id = 1; id <= 4; id++) {
            insertSharedMedia(jdbcTemplate, id, MEMBER_ID, id, BASE);
        }

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new SearchQuery(query));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 캡션이_null이면_작성자와_장소명이_일치해도_검색하지_않는다() {
        // given
        insertSearchableMedia(1L, null);
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new SearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .isEmpty();
    }

    private void insertSearchableMedia(Long mediaId, String caption) {
        insertMedia(jdbcTemplate, mediaId, caption, "search-" + mediaId + ".jpg", "성수 카페");
        insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
    }

    private SavedMediaProjections search(boolean withCursor) {
        SearchQuery query = new SearchQuery("성수");
        if (withCursor) {
            return sharedMediaDao.findSavedMediaByQueryBefore(
                    MEMBER_ID, query, new SharedMediaCursor(BASE.plusSeconds(10), 999L));
        }
        return sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, query);
    }
}
