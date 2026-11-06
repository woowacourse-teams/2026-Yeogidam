package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.sharedUrl;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.insertReport;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.path.json.JsonPath;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

class SavedMediaE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/saved-media";
    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";
    private static final String SHARES_PATH = "/api/v1/shares";
    private static final Instant BASE = Instant.parse("2026-11-01T03:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        // when & then
        given().when().get(PATH)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    @Test
    void 보관함_게시물을_게시물에서_나온_장소와_함께_돌려준다() {
        // given: 게시물 1에서 담다식당, 카페 온월 순서로 장소가 나왔고, 회원은 담다식당을 보관함에서 지웠다
        LoginResult login = loginAsKakao("saved-media-response-user");
        insertMedia(jdbcTemplate, 1L, "성수 감성 카페 모음", "media.jpg", "@seongsu_cafe");
        insertPlace(jdbcTemplate, 1L, "kakao-saved-media-1", "카페 온월", "음식점 > 카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", new BigDecimal("37.5446"),
                new BigDecimal("127.0559"), "https://place.map.kakao.com/1", null, "place-1.jpg", "KAKAO");
        insertPlace(jdbcTemplate, 2L, "kakao-saved-media-2", "담다식당", "음식점 > 한식",
                "서울 성동구 성수동1가 2-2", null, new BigDecimal("37.5440"),
                new BigDecimal("127.0500"), "https://place.map.kakao.com/2", null, null, null);
        insertMediaPlace(jdbcTemplate, 1L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 2L, 1L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 1L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].sharedMediaId", equalTo(1))
                .body("sharedMedias[0].createdAt", equalTo("2026-11-01T03:00:00.123456Z"))
                .body("sharedMedias[0].thumbnailUrl", equalTo("https://img.example.com/media.jpg"))
                .body("sharedMedias[0].caption", equalTo("성수 감성 카페 모음"))
                .body("sharedMedias[0].author", equalTo("@seongsu_cafe"))
                .body("sharedMedias[0].sharedUrl", equalTo("https://www.instagram.com/reel/fixture-1/"))
                .body("sharedMedias[0].places", hasSize(2))
                .body("sharedMedias[0].places[0].savedPlaceId", nullValue())
                .body("sharedMedias[0].places[0].placeId", equalTo(2))
                .body("sharedMedias[0].places[0].name", equalTo("담다식당"))
                .body("sharedMedias[0].places[0].categoryCode", equalTo("KOREAN"))
                .body("sharedMedias[0].places[0].roadAddress", nullValue())
                .body("sharedMedias[0].places[0].thumbnailUrl", nullValue())
                .body("sharedMedias[0].places[1].savedPlaceId", equalTo(10))
                .body("sharedMedias[0].places[1].placeId", equalTo(1))
                .body("sharedMedias[0].places[1].name", equalTo("카페 온월"))
                .body("sharedMedias[0].places[1].category", equalTo("음식점 > 카페"))
                .body("sharedMedias[0].places[1].categoryCode", equalTo("CAFE"))
                .body("sharedMedias[0].places[1].categoryName", equalTo("카페"))
                .body("sharedMedias[0].places[1].landLotAddress", equalTo("서울 성동구 성수동2가 1-1"))
                .body("sharedMedias[0].places[1].roadAddress", equalTo("서울 성동구 연무장길 1"))
                .body("sharedMedias[0].places[1].thumbnailUrl", equalTo("https://img.example.com/place-1.jpg"))
                .body("nextCursor", nullValue());
    }

    @Test
    void 보관함_게시물이_없으면_빈_목록을_돌려준다() {
        // given
        LoginResult login = loginAsKakao("saved-media-empty-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0))
                .body("nextCursor", nullValue());
    }

    @Test
    void 받은_커서로_다음_페이지를_조회하면_남은_게시물을_돌려주고_다음_커서는_null이다() {
        // given: 게시물 55개를 1초 간격으로 한 번씩 공유했고, 모두 보관함 장소와 연결되어 있다
        LoginResult login = loginAsKakao("saved-media-page-user");
        insertSavedMediaOneSecondApart(login.memberId(), 55);
        JsonPath firstPage = givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(50))
                .body("nextCursor.createdAt", equalTo("2026-11-01T03:00:06.123456Z"))
                .body("nextCursor.id", equalTo(6))
                .extract().jsonPath();

        // when & then
        givenBearer(login.accessToken())
                .queryParam("cursorCreatedAt", firstPage.getString("nextCursor.createdAt"))
                .queryParam("cursorId", firstPage.getLong("nextCursor.id"))
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(5, 4, 3, 2, 1))
                .body("nextCursor", nullValue());
    }

    @ParameterizedTest
    @CsvSource(value = {"2026-11-01T03:00:06.123456Z, NULL", "NULL, 6"}, nullValues = "NULL")
    void 커서의_공유_시각과_ID_중_하나만_보내면_400_예외를_던진다(String cursorCreatedAt, Long cursorId) {
        // given
        LoginResult login = loginAsKakao("saved-media-incomplete-cursor-user");

        // when & then
        var request = givenBearer(login.accessToken());
        if (cursorCreatedAt != null) {
            request.queryParam("cursorCreatedAt", cursorCreatedAt);
        }
        if (cursorId != null) {
            request.queryParam("cursorId", cursorId);
        }
        request.when().get(PATH)
                .then().statusCode(MediaErrorCode.INCOMPLETE_CURSOR.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getCode()))
                .body("message", equalTo(MediaErrorCode.INCOMPLETE_CURSOR.getMessage()));
    }

    @Test
    void 같은_게시물을_여러_번_공유했어도_게시글을_지우면_게시물_탭에서_사라지고_히스토리에는_남는다() {
        // given: 게시물 21을 공유 1과 3으로 두 번, 게시물 22를 공유 2로 공유했다
        LoginResult login = loginAsKakao("saved-media-delete-tab-user");
        insertTwoMediaWithOverlappingPlace(login.memberId());

        // when: 게시물 탭에 대표로 보이는 게시물 21의 최신 공유 3만 지운다
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "3")
                .when().delete(PATH)
                .then().statusCode(204);

        // then: 게시물 21의 옛 공유 1이 대신 올라오지 않고, 히스토리에는 세 공유가 그대로 있다
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(2));
        givenBearer(login.accessToken())
                .when().get(SHARES_PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(3, 2, 1));
    }

    @Test
    void 게시글을_지우면_지운_게시글에만_있던_장소는_사라지고_다른_게시글에도_있는_장소는_보관함에_남는다() {
        // given: 카페 온월은 게시물 21에서만, 담다식당은 게시물 21과 22에서 저장했다
        LoginResult login = loginAsKakao("saved-media-delete-place-user");
        insertTwoMediaWithOverlappingPlace(login.memberId());

        // when
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "3")
                .when().delete(PATH)
                .then().statusCode(204);

        // then: 카페 온월(보관함 10)은 빠지고, 게시물 22에도 있는 담다식당(보관함 11)은 남는다
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.savedPlaceId", contains(11));
    }

    @Test
    void 이미_지운_게시글이나_남의_게시글을_보내도_204를_돌려주고_남의_게시글은_지우지_않는다() {
        // given: 같은 게시물 21을 회원과 다른 회원이 각각 공유 1, 2로 공유해 카페 온월을 저장했다
        LoginResult login = loginAsKakao("saved-media-delete-owner");
        LoginResult other = loginAsKakao("saved-media-delete-other");
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "21.jpg", "@seongsu_cafe");
        insertTwoPlaces();
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, other.memberId(), 21L, BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlace(jdbcTemplate, 20L, other.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 200L, 20L, 2L, BASE);
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1")
                .when().delete(PATH)
                .then().statusCode(204);

        // when: 이미 지운 1, 없는 99, 남의 게시글 2를 함께 보낸다
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1,99,2")
                .when().delete(PATH)
                .then().statusCode(204);

        // then
        givenBearer(other.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(2));
        givenBearer(other.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.savedPlaceId", contains(20));
    }

    @Test
    void 지운_게시물을_다시_공유하면_게시물_탭과_보관함에_돌아온다() {
        // given: 분석에 성공한 게시물 21에서 카페 온월을 저장한 뒤 게시글(공유 1)을 지웠다
        LoginResult login = loginAsKakao("saved-media-reshare-user");
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "21.jpg", "@seongsu_cafe");
        insertTwoPlaces();
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, sharedUrl(21L), BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1")
                .when().delete(PATH)
                .then().statusCode(204);

        // when
        int sharedMediaId = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + sharedUrl(21L) + "\"}")
                .when().post(SHARES_PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().path("sharedMediaId");

        // then
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(sharedMediaId))
                .body("sharedMedias[0].places[0].savedPlaceId", notNullValue());
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.placeId", contains(1));
    }

    @Test
    void 재공유한_게시글을_지워도_같은_장소가_나온_다른_게시글이_남아_있으면_장소는_보관함에_남는다() {
        // given: 게시물 21(공유 1)에서 카페 온월과 담다식당을, 게시물 22(공유 2)에서 카페 온월을 저장했다
        LoginResult login = loginAsKakao("saved-media-resaved-place-user");
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "21.jpg", "@seongsu_cafe");
        insertMedia(jdbcTemplate, 22L, "성수 카페 한 곳", "22.jpg", "@seongsu_one");
        insertTwoPlaces();
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 2L, 21L, 2L);
        insertMediaPlace(jdbcTemplate, 3L, 22L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 22L, sharedUrl(22L), BASE.plusSeconds(1));
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 2L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 101L, 11L, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 102L, 10L, 2L, BASE.plusSeconds(1));
        // 카페 온월을 보관함에서 뺐다가 게시물 22를 다시 공유해 저장하면, 새 보관함 항목은 새 공유에만 연결된다
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

        // when: 다시 공유한 게시물 22의 게시글을 지운다
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", resharedId)
                .when().delete(PATH)
                .then().statusCode(204);

        // then: 지우지 않은 게시물 21에도 카페 온월이 있으므로, 보관함에 남고 게시물 21의 상세에서도 체크가 풀리지 않는다
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.placeId", containsInAnyOrder(1, 2));
        givenBearer(login.accessToken())
                .when().get(PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(1))
                .body("sharedMedias[0].places[0].placeId", equalTo(1))
                .body("sharedMedias[0].places[0].savedPlaceId", notNullValue());
    }

    @Test
    void 게시글을_지우면_폴더에_담은_장소도_사라지고_다시_공유해도_폴더에는_돌아오지_않는다() {
        // given: 게시물 21(공유 1)에서 저장한 카페 온월을 폴더 「데이트」에 담았다
        LoginResult login = loginAsKakao("saved-media-folder-user");
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "21.jpg", "@seongsu_cafe");
        insertTwoPlaces();
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, sharedUrl(21L), BASE);
        insertSavedPlace(jdbcTemplate, 10L, login.memberId(), 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        insertFolder(jdbcTemplate, 31L, login.memberId(), "데이트", "RED");
        insertFolderSavedPlace(jdbcTemplate, 1L, 31L, 10L);

        // when
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1")
                .when().delete(PATH)
                .then().statusCode(204);

        // then: 카페 온월은 보관함에서 빠지고, 게시물을 다시 공유해 다시 담겨도 폴더 지정은 돌아오지 않는다
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(0));
        givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + sharedUrl(21L) + "\"}")
                .when().post(SHARES_PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value());
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.placeId", contains(1))
                .body("savedPlaces[0].folderIds", hasSize(0));
    }

    @Test
    void 게시글을_지워도_제보와_히스토리는_남는다() {
        // given: 장소를 찾지 못한 게시물 31의 공유 1을 제보했다
        LoginResult login = loginAsKakao("saved-media-report-user");
        insertFailedMedia(jdbcTemplate, 31L, 1, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 31L, BASE);
        insertReport(jdbcTemplate, 1L, 1L, BASE.plusSeconds(1));

        // when
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "1")
                .when().delete(PATH)
                .then().statusCode(204);

        // then
        Integer reportCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM shared_media_reports WHERE shared_media_id = ?", Integer.class, 1L);
        assertThat(reportCount).isEqualTo(1);
        givenBearer(login.accessToken())
                .when().get(SHARES_PATH)
                .then().statusCode(200)
                .body("sharedMedias.sharedMediaId", contains(1));
    }

    @Test
    void 삭제할_게시글을_빈_값으로_보내면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("saved-media-delete-empty");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("sharedMediaIds", "")
                .when().delete(PATH)
                .then().statusCode(MediaErrorCode.EMPTY_SHARED_MEDIA_IDS.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.EMPTY_SHARED_MEDIA_IDS.getCode()))
                .body("message", equalTo(MediaErrorCode.EMPTY_SHARED_MEDIA_IDS.getMessage()));
    }

    @Test
    void 토큰_없이_삭제하면_401_예외를_던진다() {
        // when & then
        given().queryParam("sharedMediaIds", "1")
                .when().delete(PATH)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    /**
     * 게시물 21을 공유 1과 3으로 두 번, 게시물 22를 공유 2로 공유한 상태를 만든다.
     * 카페 온월(보관함 10)은 게시물 21에서만, 담다식당(보관함 11)은 게시물 21과 22에서 저장했다.
     */
    private void insertTwoMediaWithOverlappingPlace(Long memberId) {
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "21.jpg", "@seongsu_cafe");
        insertMedia(jdbcTemplate, 22L, "성수 맛집 모음", "22.jpg", "@seongsu_food");
        insertTwoPlaces();
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 2L, 21L, 2L);
        insertMediaPlace(jdbcTemplate, 3L, 22L, 2L);
        insertSharedMedia(jdbcTemplate, 1L, memberId, 21L, BASE);
        insertSharedMedia(jdbcTemplate, 2L, memberId, 22L, BASE.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, memberId, 21L, BASE.plusSeconds(2));
        insertSavedPlace(jdbcTemplate, 10L, memberId, 1L, BASE);
        insertSavedPlace(jdbcTemplate, 11L, memberId, 2L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 100L, 10L, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 101L, 11L, 1L, BASE);
        insertSavedPlaceShare(jdbcTemplate, 102L, 11L, 2L, BASE.plusSeconds(1));
        insertSavedPlaceShare(jdbcTemplate, 103L, 10L, 3L, BASE.plusSeconds(2));
        insertSavedPlaceShare(jdbcTemplate, 104L, 11L, 3L, BASE.plusSeconds(2));
    }

    /**
     * 장소 1은 카페 온월, 장소 2는 담다식당이다.
     */
    private void insertTwoPlaces() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-delete-1", "카페 온월",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 2L, "kakao-delete-2", "담다식당",
                "서울 성동구 성수동1가 2-2", new BigDecimal("37.5440"), new BigDecimal("127.0500"));
    }

    /**
     * 게시물 1부터 count까지 1초 간격으로 한 번씩 공유하고, 모든 공유를 같은 보관함 장소와 연결한다. ID가 클수록 최근 공유다.
     */
    private void insertSavedMediaOneSecondApart(Long memberId, int count) {
        insertPlace(jdbcTemplate, 1L, "kakao-saved-media-page", "성수 카페", "음식점 > 카페",
                "서울 성동구 성수동2가 1-1", null, new BigDecimal("37.5446"),
                new BigDecimal("127.0559"), null, null, null, null);
        insertSavedPlace(jdbcTemplate, 1L, memberId, 1L, BASE);
        for (long id = 1; id <= count; id++) {
            Instant createdAt = BASE.plusSeconds(id);
            insertMedia(jdbcTemplate, id, "페이지 게시물 " + id, "page-" + id + ".jpg", "@page");
            insertMediaPlace(jdbcTemplate, id, id, 1L);
            insertSharedMedia(jdbcTemplate, id, memberId, id, createdAt);
            insertSavedPlaceShare(jdbcTemplate, id, 1L, id, createdAt);
        }
    }
}
