package com.yeogidam.place;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 보관함 목록 조회, 관련 릴스 조회, 삭제를 실제 HTTP로 검증한다. 정렬과 열 매핑의 세부는 SavedPlaceDaoTest가 맡고, 여기서는 응답 모양(감싸는 키, 필드 이름, null)과 인가가 응답으로 드러나는지만
 * 본다. 회원은 로그인이 만들고 나머지 행은 SQL fixture로 given에서 넣는다.
 */
class SavedPlaceE2eTest extends E2eTestSupport {

    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 로그인하면_내_보관함을_최근에_저장한_순서로_조회한다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 13L, login.memberId(), 3L, Instant.parse("2026-09-15T00:00:10Z"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(3))
                .body("savedPlaces.savedPlaceId", contains(13, 12, 11))
                .body("savedPlaces.placeId", contains(3, 2, 1))
                .body("savedPlaces[0].name", equalTo("경복궁"))
                .body("savedPlaces[0].category", equalTo("관광명소"))
                .body("savedPlaces.categoryCode", contains("CULTURE_LEISURE", "CAFE", "CAFE"))
                .body("savedPlaces.categoryName", contains("문화/여가", "카페", "카페"))
                .body("savedPlaces[1].name", equalTo("윤숲 후르츠산도"))
                .body("savedPlaces[1].category", equalTo("음식점 > 카페"))
                .body("savedPlaces[2].category", equalTo("음식점 > 카페"))
                .body("savedPlaces[0].landLotAddress", equalTo("서울 종로구 세종로 1-1"))
                .body("savedPlaces[0].roadAddress", equalTo("서울 종로구 사직로 161"))
                .body("savedPlaces[0].latitude", equalTo(37.5796f))
                .body("savedPlaces[0].longitude", equalTo(126.9770f))
                .body("savedPlaces[0].kakaoPlaceUrl", equalTo("https://place.map.kakao.com/3"))
                .body("savedPlaces[0].telephone", nullValue())
                .body("savedPlaces[0].thumbnailUrl", equalTo("https://img.example.com/3.jpg"))
                .body("savedPlaces[0].thumbnailSource", equalTo("KAKAO"))
                .body("savedPlaces[0].lastSavedAt", equalTo("2026-09-15T00:00:10Z"))
                .body("savedPlaces[1].roadAddress", nullValue());
    }

    @Test
    void 폴더를_생성한_순서대로_ID를_반환하고_폴더가_없으면_빈_배열이다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:10Z"));
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 13L, login.memberId(), 3L, Instant.parse("2026-09-15T00:00:00Z"));
        Instant firstCreatedAt = Instant.parse("2026-09-14T00:00:00.123456Z");
        insertFolder(jdbcTemplate, 51L, login.memberId(), "성수 카페", "RED", firstCreatedAt.plusNanos(1_000));
        insertFolder(jdbcTemplate, 52L, login.memberId(), "가고 싶은 곳", "GREEN", firstCreatedAt);
        Instant addedAt = Instant.parse("2026-09-16T00:00:00Z");
        insertFolderSavedPlace(jdbcTemplate, 1L, 51L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 2L, 52L, 11L, addedAt.plusNanos(1_000));
        insertFolderSavedPlace(jdbcTemplate, 3L, 52L, 12L, addedAt);

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces", hasSize(3))
                .body("savedPlaces.savedPlaceId", contains(11, 12, 13))
                .body("savedPlaces[0].folderIds", contains(52, 51))
                .body("savedPlaces[1].folderIds", contains(52))
                .body("savedPlaces[2].folderIds", hasSize(0));
    }

    @Test
    void 폴더를_생성한_시각이_같으면_폴더_ID_순서대로_반환한다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        Instant createdAt = Instant.parse("2026-09-14T00:00:00.123456Z");
        insertFolder(jdbcTemplate, 51L, login.memberId(), "성수 카페", "RED", createdAt);
        insertFolder(jdbcTemplate, 52L, login.memberId(), "가고 싶은 곳", "GREEN", createdAt);
        Instant addedAt = Instant.parse("2026-09-16T00:00:00Z");
        insertFolderSavedPlace(jdbcTemplate, 1L, 52L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 2L, 51L, 11L, addedAt);

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces[0].folderIds", contains(51, 52));
    }

    @Test
    void 폴더_ID는_로그인한_회원의_폴더와_보관함_장소가_연결된_것만_반환한다() {
        // given
        LoginResult owner = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, owner.memberId(), 1L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 12L, owner.memberId(), 2L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 21L, other.memberId(), 1L, Instant.parse("2026-09-15T00:00:10Z"));
        Instant createdAt = Instant.parse("2026-09-14T00:00:00Z");
        insertFolder(jdbcTemplate, 51L, owner.memberId(), "내 폴더", "RED", createdAt);
        insertFolder(jdbcTemplate, 61L, other.memberId(), "다른 회원 폴더", "GREEN", createdAt);
        Instant addedAt = Instant.parse("2026-09-16T00:00:00Z");
        insertFolderSavedPlace(jdbcTemplate, 1L, 51L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 2L, 61L, 21L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 3L, 61L, 11L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 4L, 61L, 12L, addedAt);
        insertFolderSavedPlace(jdbcTemplate, 5L, 51L, 21L, addedAt);

        // when & then
        givenBearer(owner.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces", hasSize(2))
                .body("savedPlaces.savedPlaceId", contains(11, 12))
                .body("savedPlaces[0].folderIds", contains(51))
                .body("savedPlaces[1].folderIds", hasSize(0));
    }

    @Test
    void 카테고리가_null이면_원문은_null로_유지하고_기타_칩을_돌려준다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "kakao-1", "카테고리 없는 장소", "서울 광진구 화양동 1-1",
                new BigDecimal("37.5400"), new BigDecimal("127.0700"));
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces", hasSize(1))
                .body("savedPlaces[0].category", nullValue())
                .body("savedPlaces[0].categoryCode", equalTo("ETC"))
                .body("savedPlaces[0].categoryName", equalTo("기타"));
    }

    @Test
    void 카테고리_원문의_공백은_유지하고_분류한_칩을_함께_돌려준다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        String category = "  음식점  >  간식 > 베이커리  ";
        insertPlace(jdbcTemplate, 1L, "kakao-1", "성수 베이커리", category, "서울 성동구 성수동2가 289-10",
                null, new BigDecimal("37.5445"), new BigDecimal("127.0561"),
                "https://place.map.kakao.com/1", null, null, null);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces[0].category", equalTo(category))
                .body("savedPlaces[0].categoryCode", equalTo("DESSERT"))
                .body("savedPlaces[0].categoryName", equalTo("디저트"));
    }

    @Test
    void 저장한_장소가_없으면_빈_목록이다() {
        // given
        LoginResult login = loginAsKakao("user-9");

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(0));
    }

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        given().when().get(SAVED_PLACES_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 저장한_장소의_관련_릴스를_조회한다() {
        // given: 릴스 10을 두 번(공유 100, 102) 공유해 보관함 11(카페 온월)을 두 공유에서 저장했다. 같은 릴스라 최신 공유 102 한 건만 나와야 한다
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertMedia(jdbcTemplate, 10L, "성수 카페 투어", "reel10.jpg", "@seongsu_life");
        insertSharedMedia(jdbcTemplate, 100L, login.memberId(), 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-10T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 102L, login.memberId(), 10L, "https://www.instagram.com/reel/C1seongsu/", Instant.parse("2026-09-12T10:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 100L, Instant.parse("2026-09-10T12:00:00Z"));
        insertSavedPlaceShare(jdbcTemplate, 2L, 11L, 102L, Instant.parse("2026-09-12T12:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH + "/11/media")
                .then().statusCode(200)
                .body("media", hasSize(1))
                .body("media[0].sharedMediaId", equalTo(102))
                .body("media[0].thumbnailUrl", equalTo("https://img.example.com/reel10.jpg"))
                .body("media[0].author", equalTo("@seongsu_life"))
                .body("media[0].caption", equalTo("성수 카페 투어"))
                .body("media[0].sharedUrl", equalTo("https://www.instagram.com/reel/C1seongsu/"))
                .body("media[0].createdAt", equalTo("2026-09-12T10:00:00Z"));
    }

    @Test
    void 남의_보관함_항목의_관련_릴스를_조회하면_404_예외를_던진다() {
        // given: 보관함 11은 user-1의 것이고 user-2가 그 id로 조회한다
        LoginResult owner = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, owner.memberId(), 2L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        givenBearer(other.accessToken())
                .when().get(SAVED_PLACES_PATH + "/11/media")
                .then().statusCode(404)
                .body("errorCode", equalTo("PLACE404_001"));
    }

    @Test
    void 토큰_없이_관련_릴스를_조회하면_401_예외를_던진다() {
        given().when().get(SAVED_PLACES_PATH + "/11/media")
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 고른_보관함_항목을_한_번에_삭제하면_목록에서_사라진다() {
        // given: 경로의 id는 saved_places의 id라서 장소 id(1, 2, 3)와 겹치지 않는 값(11, 12, 13)으로 넣는다
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 12L, login.memberId(), 2L, Instant.parse("2026-09-15T00:00:05Z"));
        insertSavedPlace(jdbcTemplate, 13L, login.memberId(), 3L, Instant.parse("2026-09-15T00:00:10Z"));

        // when: 보관함 11(장소 1)과 12(장소 2)를 한 번에 지운다
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "11,12")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(204);

        // then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.placeId", contains(3));
    }

    @Test
    void 이미_삭제했거나_남의_보관함_항목이_섞여_있어도_멱등하게_처리한다() {
        // given: 보관함 11은 user-1, 21은 user-2의 것이다
        LoginResult login = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertSavedPlace(jdbcTemplate, 21L, other.memberId(), 2L, Instant.parse("2026-09-15T00:00:05Z"));
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "11")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(204);

        // when: 이미 지운 11, 없는 99, 남의 항목 21을 함께 보낸다
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "11,99,21")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(204);

        // then: 남의 보관함은 그대로다
        givenBearer(other.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.placeId", contains(2));
    }

    @Test
    void 삭제할_항목_파라미터가_아예_없으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_003"));
    }

    @Test
    void 삭제할_항목_파라미터가_비어_있으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("PLACE400_001"));
    }

    @Test
    void 삭제할_항목이_숫자가_아니면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .queryParam("savedPlaceIds", "abc")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_004"));
    }

    @Test
    void 보관함_항목_id가_숫자가_아니면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH + "/abc/media")
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_004"));
    }

    @Test
    void 토큰_없이_삭제하면_401_예외를_던진다() {
        given().queryParam("savedPlaceIds", "11")
                .when().delete(SAVED_PLACES_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    /**
     * 카페 온월은 열 전부가 채워진 장소(구글 사진), 윤숲은 카테고리 외의 선택 열이 NULL인 카페, 경복궁은 카카오 사진에 전화가 없는 장소다.
     */
    private void insertThreePlaces() {
        insertPlace(jdbcTemplate, 1L, "kakao-1", "카페 온월", "음식점 > 카페", "서울 성동구 성수동2가 289-10",
                "서울 성동구 성수이로 26 2층", new BigDecimal("37.5445"), new BigDecimal("127.0561"),
                "https://place.map.kakao.com/1", "02-1234-5678", "https://img.example.com/1.jpg", "GOOGLE");
        insertPlace(jdbcTemplate, 2L, "kakao-2", "윤숲 후르츠산도", "음식점 > 카페", "서울 광진구 화양동 1-1",
                null, new BigDecimal("37.5400"), new BigDecimal("127.0700"), null, null, null, null);
        insertPlace(jdbcTemplate, 3L, "kakao-3", "경복궁", "관광명소", "서울 종로구 세종로 1-1", "서울 종로구 사직로 161",
                new BigDecimal("37.5796"), new BigDecimal("126.9770"), "https://place.map.kakao.com/3", null,
                "https://img.example.com/3.jpg", "KAKAO");
    }
}
