package com.yeogidam.place;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.sharedUrl;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 장소 상세 목록을 장소 ID로 조회하는 API를 실제 HTTP로 검증한다.
 * SQL 조건 하나하나와 정렬은 PlaceDaoTest가 맡고, 여기서는 응답 모양과 인증, 그리고 보관함 장소 삭제, 공유, 게시글 삭제 API를 부른 뒤에 목록이 맞게 나오는지를 본다.
 * 보관함에 저장하지 않은 장소도 게시글이 나온다는 점은 옛 경로(`GET /api/v1/saved-places/{savedPlaceId}/media`)와 달라지는 API 계약이라 여기서도 확인한다.
 */
class PlaceE2eTest extends E2eTestSupport {

    private static final String PLACES_PATH = "/api/v1/places";
    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";
    private static final String SAVED_MEDIA_PATH = "/api/v1/saved-media";
    private static final String SHARES_PATH = "/api/v1/shares";
    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 장소가_나온_내_게시글의_필드를_빠짐없이_돌려준다() {
        // given: 게시물 21에서 카페 온월이 추출됐고, 회원이 게시물 21을 공유했다
        LoginResult login = loginAsKakao("place-media-fields-user");
        insertCafeOnwol();
        insertMedia(jdbcTemplate, 21L, "성수 카페 투어", "reel21.jpg", "@seongsu_life");
        insertMediaPlace(jdbcTemplate, 21L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, "https://www.instagram.com/reel/C1seongsu/", BASE);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/1/media")
                .then().statusCode(200)
                .body("media", hasSize(1))
                .body("media[0].sharedMediaId", equalTo(1))
                .body("media[0].thumbnailUrl", equalTo("https://img.example.com/reel21.jpg"))
                .body("media[0].author", equalTo("@seongsu_life"))
                .body("media[0].caption", equalTo("성수 카페 투어"))
                .body("media[0].sharedUrl", equalTo("https://www.instagram.com/reel/C1seongsu/"))
                .body("media[0].createdAt", equalTo("2026-11-01T03:00:00.123456Z"));
    }

    @Test
    void 저장한_장소면_장소가_나온_내_게시글을_돌려준다() {
        // given: 게시물 21에서 카페 온월이 추출됐고, 회원이 게시물 21을 공유해 카페 온월을 보관함에 저장했다
        LoginResult login = loginAsKakao("place-media-saved-user");
        insertCafeOnwol();
        insertMediaWithCafeOnwol(21L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/1/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", contains(1));
    }

    @Test
    void 저장하지_않은_장소도_장소가_나온_내_게시글을_돌려준다() {
        // given: 게시물 21에서 카페 온월이 추출됐지만, 회원은 카페 온월을 보관함에 저장하지 않았다
        LoginResult login = loginAsKakao("place-media-unsaved-user");
        insertCafeOnwol();
        insertMediaWithCafeOnwol(21L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/1/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", contains(1));
    }

    @Test
    void 장소를_지웠다가_다른_게시글로_다시_저장해도_앞서_공유한_게시글이_함께_나온다() {
        // given: 게시물 21(공유 1)에서 저장한 카페 온월을 보관함에서 지운 뒤, 카페 온월이 나온 게시물 22를 공유해 다시 저장했다
        LoginResult login = loginAsKakao("place-media-resaved-user");
        insertCafeOnwol();
        insertMediaWithCafeOnwol(21L);
        insertMediaWithCafeOnwol(22L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "10")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(204);
        int resharedId = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + sharedUrl(22L) + "\"}")
                .when().post(SHARES_PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().path("sharedMediaId");

        // when & then: 다시 저장한 보관함 항목은 게시물 22의 공유와만 연결되어 있지만, 게시물 21의 공유도 함께 나온다
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/1/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", containsInAnyOrder(resharedId, 1));
    }

    @Test
    void 게시글을_지우면_장소_상세_목록에서_빠진다() {
        // given: 카페 온월이 게시물 21(공유 1)과 게시물 22(공유 2)에서 모두 추출됐다
        LoginResult login = loginAsKakao("place-media-deleted-user");
        insertCafeOnwol();
        insertMediaWithCafeOnwol(21L);
        insertMediaWithCafeOnwol(22L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 22L, BASE.plusSeconds(1));

        // when: 게시물 21의 게시글을 지운다
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1")
                .when().delete(SAVED_MEDIA_PATH)
                .then().statusCode(204);

        // then
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/1/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", contains(2));
    }

    @Test
    void 없는_장소_ID로_조회하면_빈_목록을_돌려준다() {
        // given
        LoginResult login = loginAsKakao("place-media-empty-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PLACES_PATH + "/999/media")
                .then().statusCode(200)
                .body("media", hasSize(0));
    }

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        given().when().get(PLACES_PATH + "/1/media")
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    /**
     * 장소 1인 카페 온월을 넣는다.
     */
    private void insertCafeOnwol() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-place-media-1", "카페 온월",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
    }

    /**
     * 게시물을 넣고 카페 온월이 추출된 것으로 둔다. 추출 결과 ID는 게시물 ID와 같게 둔다.
     */
    private void insertMediaWithCafeOnwol(Long mediaId) {
        insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
        insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
    }
}
