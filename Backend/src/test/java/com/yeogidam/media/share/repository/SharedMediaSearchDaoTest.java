package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.share.domain.CaptionSearchQuery;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수 카페"));

        // then
        assertThat(shares.shares())
                .containsExactly(new SavedMediaProjection(100L, 100L, BASE.minusSeconds(1), "search-100.jpg",
                        "오래전에 공유한 게시글\n성수 카페 모음", "성수 카페", "https://www.instagram.com/reel/fixture-100/", false));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 첫_페이지와_커서_조회_모두_내_공유만_검색한다(boolean withCursor) {
        // given: 같은 게시글의 더 최근 공유도 다른 회원의 것이면 대표 공유가 될 수 없다.
        insertKakaoMember(jdbcTemplate, 2L, "media-search-other", null, null, null);
        insertSearchableMedia(1L, "성수 카페");
        insertSearchableMedia(2L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, 2L, 1L, BASE.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 2L, 2L, BASE.plusSeconds(2));

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 마지막_보관_장소를_지워도_추출_장소가_있으면_게시글은_검색에_남는다() {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, MEMBER_ID, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 1L, 10L, 1L, BASE);

        // when: 마지막 저장 장소를 지우면 공유와 보관 장소의 연결도 함께 사라진다.
        jdbcTemplate.update("DELETE FROM saved_places WHERE id = ?", 10L);
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 보관_연결이_남아_있어도_삭제한_공유는_검색에서_제외한다(boolean withCursor) {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertDeletedSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE, BASE.plusSeconds(1));
        insertSavedPlace(jdbcTemplate, 10L, MEMBER_ID, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 1L, 10L, 1L, BASE);

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .isEmpty();
    }

    @ParameterizedTest
    @CsvSource(nullValues = "NULL", value = {
            "false, EXTRACTING, NULL", "true, EXTRACTING, NULL",
            "false, FAILED, UNEXPECTED", "true, FAILED, UNEXPECTED"
    })
    void 미디어가_성공했어도_공유가_분석_중이거나_실패했으면_검색에서_제외한다(
            boolean withCursor,
            String status,
            String failureReason
    ) {
        // given: 미디어 상태와 공유 상태를 다르게 만들어 공유의 상태를 기준으로 거르는지 확인한다.
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        jdbcTemplate.update("UPDATE shared_media SET extraction_status = ?, failure_reason = ? WHERE id = ?",
                status, failureReason, 1L);

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .isEmpty();
    }

    @Test
    void 미디어가_재분석_중이어도_성공한_공유와_추출_장소가_있으면_검색한다() {
        // given
        insertMedia(jdbcTemplate, 1L, "성수 카페", null, null, "SUCCEEDED", null, 1, "EXTRACTED");
        insertMediaPlace(jdbcTemplate, 1L, 1L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        jdbcTemplate.update("UPDATE media SET extraction_status = 'EXTRACTING' WHERE id = ?", 1L);

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 성공한_공유라도_추출_장소가_없으면_검색에서_제외한다(boolean withCursor) {
        // given
        insertMedia(jdbcTemplate, 1L, "성수 카페", null, null);
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .isEmpty();
    }

    @ParameterizedTest
    @CsvSource(nullValues = "NULL", value = {
            "false, EXTRACTING, NULL", "true, EXTRACTING, NULL",
            "false, FAILED, UNEXPECTED", "true, FAILED, UNEXPECTED"
    })
    void 최신_공유가_분석에_성공하지_않았으면_이전의_성공한_공유를_선택한다(
            boolean withCursor,
            String status,
            String failureReason
    ) {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, MEMBER_ID, 1L, BASE.plusSeconds(1));
        jdbcTemplate.update("UPDATE shared_media SET extraction_status = ?, failure_reason = ? WHERE id = ?",
                status, failureReason, 2L);

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 최신_공유가_삭제되었으면_이전의_삭제하지_않은_공유를_선택한다(boolean withCursor) {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);
        insertDeletedSharedMedia(jdbcTemplate, 2L, MEMBER_ID, 1L, BASE.plusSeconds(1), BASE.plusSeconds(2));

        // when
        SavedMediaProjections shares = search(withCursor);

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 대표_공유는_ID보다_공유_시각이_최신인_공유를_선택한다() {
        // given: 새 공유의 ID가 더 작아도 공유 시각이 최신이면 대표가 된다.
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 100L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 10L, MEMBER_ID, 1L, BASE.plusSeconds(1));

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(10L);
    }

    @Test
    void 같은_게시글을_같은_시각에_재공유하면_큰_ID를_대표로_선택한다() {
        // given
        insertSearchableMedia(1L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 20L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 30L, MEMBER_ID, 1L, BASE);

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(30L);
    }

    @Test
    void 서로_다른_게시글도_ID보다_공유_시각이_최신인_순서로_반환한다() {
        // given
        insertSharesWithConflictingIdAndTime();

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(10L, 20L, 100L);
    }

    @Test
    void 커서보다_공유_시각이_오래되면_공유_ID가_커서보다_커도_반환한다() {
        // given
        insertSharesWithConflictingIdAndTime();

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQueryBefore(
                MEMBER_ID, new CaptionSearchQuery("성수"), new SharedMediaCursor(BASE.plusMillis(500), 20L));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(100L);
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
                MEMBER_ID, new CaptionSearchQuery("성수 카페"), new SharedMediaCursor(BASE.plusSeconds(1), 3L));

        // then
        assertThat(shares.shares())
                .extracting(SavedMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 검색_결과를_51건까지만_읽고_대표_공유를_고른_뒤_커서를_적용한다() {
        // given: 최신 게시글의 옛 공유는 다음 페이지의 커서 뒤에 있어도 다시 나오면 안 된다.
        for (long id = 1; id <= 60; id++) {
            insertSearchableMedia(id, "성수 카페");
            insertSharedMedia(jdbcTemplate, id, MEMBER_ID, id, BASE);
        }
        insertSharedMedia(jdbcTemplate, 501L, MEMBER_ID, 60L, BASE.minusSeconds(1));

        // when
        SavedMediaProjections first = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));
        SavedMediaProjections second = sharedMediaDao.findSavedMediaByQueryBefore(
                MEMBER_ID, new CaptionSearchQuery("성수"), first.nextCursor());

        // then
        assertAll(
                () -> assertThat(first.shares())
                        .extracting(SavedMediaProjection::sharedMediaId)
                        .containsExactlyElementsOf(descendingIds(60, 51)),
                () -> assertThat(first.nextCursor())
                        .isEqualTo(new SharedMediaCursor(BASE, 11L)),
                () -> assertThat(second.shares())
                        .extracting(SavedMediaProjection::sharedMediaId)
                        .containsExactlyElementsOf(descendingIds(10, 10)),
                () -> assertThat(second.nextCursor())
                        .isNull()
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"bluebottlecoffee", "BLUE BOTTLE", "  blue\tbottle\ncoffee  "})
    void 영문_대소문자와_스페이스_탭_줄바꿈_차이를_허용한다(String query) {
        // given
        insertSearchableMedia(1L, "Blue \tBottle\r\n Coffee");
        insertSharedMedia(jdbcTemplate, 1L, MEMBER_ID, 1L, BASE);

        // when
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery(query));

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
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery(query));

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
        SavedMediaProjections shares = sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, new CaptionSearchQuery("성수"));

        // then
        assertThat(shares.shares())
                .isEmpty();
    }

    private void insertSharesWithConflictingIdAndTime() {
        insertSearchableMedia(1L, "성수 카페");
        insertSearchableMedia(2L, "성수 카페");
        insertSearchableMedia(3L, "성수 카페");
        insertSharedMedia(jdbcTemplate, 100L, MEMBER_ID, 1L, BASE);
        insertSharedMedia(jdbcTemplate, 10L, MEMBER_ID, 2L, BASE.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 20L, MEMBER_ID, 3L, BASE.plusMillis(500));
    }

    private void insertSearchableMedia(Long mediaId, String caption) {
        insertMedia(jdbcTemplate, mediaId, caption, "search-" + mediaId + ".jpg", "성수 카페");
        insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
    }

    private SavedMediaProjections search(boolean withCursor) {
        CaptionSearchQuery query = new CaptionSearchQuery("성수");
        if (withCursor) {
            return sharedMediaDao.findSavedMediaByQueryBefore(
                    MEMBER_ID, query, new SharedMediaCursor(BASE.plusSeconds(10), 999L));
        }
        return sharedMediaDao.findSavedMediaByQuery(MEMBER_ID, query);
    }

    private List<Long> descendingIds(long first, long count) {
        return LongStream.iterate(first, id -> id - 1)
                .limit(count)
                .boxed()
                .toList();
    }
}
