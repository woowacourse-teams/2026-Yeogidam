package com.yeogidam.place;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertGooglePlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.place.dto.request.SavedPlaceCreateRequest;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.service.SavedPlaceService;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 보관함 목록 조회, 관련 릴스 조회, 게시물 장소 저장, 삭제를 실제 HTTP로 검증한다. 정렬과 열 매핑의 세부는 SavedPlaceDaoTest가 맡고, 여기서는 응답 모양(감싸는 키, 필드 이름, null)과 인가가 응답으로 드러나는지만
 * 본다. 회원은 로그인이 만들고 나머지 행은 SQL fixture로 given에서 넣는다.
 */
class SavedPlaceE2eTest extends E2eTestSupport {

    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";
    private static final Instant SHARED_AT = Instant.parse("2026-11-01T00:00:00Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SavedPlaceDao savedPlaceDao;

    @Autowired
    private SavedPlaceService savedPlaceService;

    @Autowired
    private PlatformTransactionManager transactionManager;

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
                .body("savedPlaces[0].mapProvider", equalTo("KAKAO"))
                .body("savedPlaces[0].countryCode", equalTo("KR"))
                .body("savedPlaces[0].placeUrl", equalTo("https://place.map.kakao.com/3"))
                .body("savedPlaces[0].telephone", nullValue())
                .body("savedPlaces[0].thumbnailUrl", equalTo("https://img.example.com/3.jpg"))
                .body("savedPlaces[0].thumbnailSource", equalTo("KAKAO"))
                .body("savedPlaces[0].lastSavedAt", equalTo("2026-09-15T00:00:10Z"))
                .body("savedPlaces[1].roadAddress", nullValue());
    }

    @Test
    void 담긴_폴더의_ID를_배열로_돌려준다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));
        insertFolder(jdbcTemplate, 51L, login.memberId(), "성수 카페", "RED");
        insertFolderSavedPlace(jdbcTemplate, 1L, 51L, 11L);

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces", hasSize(1))
                .body("savedPlaces[0].folderIds", contains(51));
    }

    @Test
    void 담긴_폴더가_없으면_빈_배열을_돌려준다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces[0].folderIds", hasSize(0));
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
    void 해외_장소는_구글을_지도_제공자로_두고_place_ID로_만든_구글맵_링크를_돌려준다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertGooglePlace(jdbcTemplate, 1L, "ChIJxwgCUhPnAGARoz8_83liVEk", "JP", "토미타 규카츠", "음식점 > 일식",
                "〒556-0011 Osaka, Naniwa Ward, Nanbanaka, 2-chōme−3−１", new BigDecimal("34.6630"),
                new BigDecimal("135.5020"));
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, Instant.parse("2026-09-15T00:00:00Z"));

        // when & then
        givenBearer(login.accessToken())
                .when()
                .get(SAVED_PLACES_PATH)
                .then()
                .statusCode(200)
                .body("savedPlaces[0].mapProvider", equalTo("GOOGLE"))
                .body("savedPlaces[0].countryCode", equalTo("JP"))
                .body("savedPlaces[0].placeUrl", equalTo("https://www.google.com/maps/search/?api=1"
                        + "&query=%ED%86%A0%EB%AF%B8%ED%83%80+%EA%B7%9C%EC%B9%B4%EC%B8%A0"
                        + "&query_place_id=ChIJxwgCUhPnAGARoz8_83liVEk"))
                .body("savedPlaces[0].kakaoPlaceUrl", nullValue())
                .body("savedPlaces[0].categoryCode", equalTo("JAPANESE"));
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
    void 저장하지_않은_장소를_저장하면_201과_새_보관함_항목_ID를_돌려준다() {
        // given: 게시물 21에서 카페 온월과 윤숲 후르츠산도가 추출됐고, 회원은 게시물 21을 공유 1로 공유했다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);

        // when
        int savedPlaceId = savePlace(login.accessToken(), 1L, 1L)
                .statusCode(201)
                .extract().path("savedPlaceId");

        // then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces.savedPlaceId", contains(savedPlaceId))
                .body("savedPlaces.placeId", contains(1));
    }

    @Test
    void 저장한_장소는_요청한_게시글에만_연결된다() {
        // given: 카페 온월은 게시물 21(공유 1)과 게시물 22(공유 2)에서 모두 추출됐다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertMedia(jdbcTemplate, 22L, "성수 카페 한 곳", "reel22.jpg", "@seongsu_one");
        insertMediaPlace(jdbcTemplate, 3L, 22L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 22L, SHARED_AT.plusSeconds(1));

        // when
        int savedPlaceId = savePlace(login.accessToken(), 1L, 1L)
                .statusCode(201)
                .extract().path("savedPlaceId");

        // then
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH + "/" + savedPlaceId + "/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", contains(1));
    }

    @Test
    void 이미_저장한_장소를_저장하면_200과_같은_보관함_항목_ID를_돌려준다() {
        // given: 카페 온월은 이미 보관함 11에 있다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SHARED_AT);

        // when & then
        savePlace(login.accessToken(), 1L, 1L)
                .statusCode(200)
                .body("savedPlaceId", equalTo(11));
    }

    @Test
    void 이미_저장한_장소를_저장해도_저장_시각과_게시글_연결은_바뀌지_않는다() {
        // given: 카페 온월은 게시물 22(공유 2)에서 저장해 보관함 11에 있다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertMedia(jdbcTemplate, 22L, "성수 카페 한 곳", "reel22.jpg", "@seongsu_one");
        insertMediaPlace(jdbcTemplate, 3L, 22L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);
        insertSharedMedia(jdbcTemplate, 2L, login.memberId(), 22L, SHARED_AT.plusSeconds(1));
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SHARED_AT.plusSeconds(1));
        insertSavedPlaceShare(jdbcTemplate, 1L, 11L, 2L, SHARED_AT.plusSeconds(1));

        // when: 게시물 21(공유 1)에서 카페 온월의 체크를 켠다
        savePlace(login.accessToken(), 1L, 1L)
                .statusCode(200);

        // then: 저장 시각은 그대로이고, 공유 1과의 연결은 생기지 않는다
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces[0].lastSavedAt", equalTo("2026-11-01T00:00:01Z"));
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH + "/11/media")
                .then().statusCode(200)
                .body("media.sharedMediaId", contains(2));
    }

    @Test
    void 남의_공유로_저장하면_404_예외를_던진다() {
        // given: 공유 1은 다른 회원의 것이다
        LoginResult owner = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, owner.memberId(), 21L, SHARED_AT);

        // when & then
        savePlace(other.accessToken(), 1L, 1L)
                .statusCode(404)
                .body("errorCode", equalTo("MEDIA404_002"));
    }

    @Test
    void 지운_게시글에서_저장하면_404_예외를_던진다() {
        // given: 게시글(공유 1)을 보관함에서 지웠다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertDeletedSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT, SHARED_AT.plusSeconds(60));

        // when & then
        savePlace(login.accessToken(), 1L, 1L)
                .statusCode(404)
                .body("errorCode", equalTo("MEDIA404_002"));
    }

    @ParameterizedTest
    @MethodSource("unsucceededShares")
    void 분석에_성공하지_않은_내_공유로_저장하면_404_예외를_던진다(
            ExtractionStatus status,
            ExtractionFailureReason failureReason
    ) {
        // given: 내 공유 1은 분석에 실패했거나 분석 중이지만, 게시물 21에서는 카페 온월이 추출됐다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT,
                new ExtractionSnapshot(status, failureReason, 1, MediaSourceType.EXTRACTED));

        // when & then
        savePlace(login.accessToken(), 1L, 1L)
                .statusCode(404)
                .body("errorCode", equalTo("MEDIA404_002"));
    }

    private static Stream<Arguments> unsucceededShares() {
        return Stream.of(
                Arguments.of(ExtractionStatus.FAILED, ExtractionFailureReason.PROCESSING_FAILED),
                Arguments.of(ExtractionStatus.EXTRACTING, null)
        );
    }

    @Test
    void 게시물에서_추출되지_않은_장소를_저장하면_404_예외를_던진다() {
        // given: 경복궁은 게시물 21에서 추출되지 않았다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);

        // when & then
        savePlace(login.accessToken(), 1L, 3L)
                .statusCode(404)
                .body("errorCode", equalTo("PLACE404_002"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"placeId\":1}", "{\"sharedMediaId\":1}"})
    void 공유_ID나_장소_ID가_없으면_400_예외를_던진다(String body) {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(body)
                .when().post(SAVED_PLACES_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_001"));
    }

    @Test
    void 토큰_없이_저장하면_401_예외를_던진다() {
        given().contentType(ContentType.JSON)
                .body("{\"sharedMediaId\":1,\"placeId\":1}")
                .when().post(SAVED_PLACES_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 게시글_삭제와_겹친_저장은_지운_게시글에_장소를_붙이지_않고_404_예외를_던진다() throws Exception {
        // given: 게시글 삭제가 게시물을 잠그고 공유를 지운 채 커밋을 미루는 사이 저장 요청이 들어와 게시물 잠금을 기다린다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> deletion = holdMediaLockWhileDeletingShare(pool, locked, release);
            locked.await();
            Future<Integer> save = pool.submit(() -> savePlace(login.accessToken(), 1L, 1L)
                    .extract().statusCode());
            awaitLockWaiter("FROM media");

            // when
            release.countDown();
            deletion.get();

            // then: 잠금을 얻은 뒤 지운 게시글로 다시 확인해서 장소를 저장하지 않는다
            assertThat(save.get()).isEqualTo(404);
            givenBearer(login.accessToken())
                    .when().get(SAVED_PLACES_PATH)
                    .then().statusCode(200)
                    .body("savedPlaces", hasSize(0));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void 체크_켜기가_먼저_잠그면_게시글_삭제가_기다렸다가_새로_저장한_장소까지_지운다() throws Exception {
        // given: 체크 켜기가 게시물을 잠그고 카페 온월을 새로 저장한 채 커밋을 미루는 사이 게시글 삭제가 들어와 게시물 잠금을 기다린다
        LoginResult login = loginAsKakao("user-1");
        insertMediaWithTwoPlaces();
        insertSharedMedia(jdbcTemplate, 1L, login.memberId(), 21L, SHARED_AT);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> save = holdCheckOnBeforeCommit(pool, locked, release, login.memberId());
            locked.await();
            Future<Integer> deletion = pool.submit(() -> givenBearer(login.accessToken())
                    .queryParam("sharedMediaIds", "1")
                    .when().delete("/api/v1/saved-media")
                    .then().extract().statusCode());
            awaitLockWaiter("FROM media");

            // when
            release.countDown();
            save.get();

            // then: 게시글 삭제가 체크 켜기의 커밋을 본 뒤, 지운 게시글에만 있는 카페 온월을 보관함에서 뺀다
            assertThat(deletion.get()).isEqualTo(204);
            givenBearer(login.accessToken())
                    .when().get(SAVED_PLACES_PATH)
                    .then().statusCode(200)
                    .body("savedPlaces", hasSize(0));
        } finally {
            pool.shutdownNow();
        }
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

    @Test
    void 보관함_장소_삭제와_같은_회원의_장소_저장이_겹쳐도_교착_없이_둘_다_끝난다() throws Exception {
        // given: 보관함 항목 ID 순서(11, 20)와 장소 ID 순서(1, 2)가 반대다
        LoginResult login = loginAsKakao("user-1");
        insertThreePlaces();
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 2L, SHARED_AT);
        insertSavedPlace(jdbcTemplate, 20L, login.memberId(), 1L, SHARED_AT);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            // 공유나 추출 완료의 저장이 장소 1을 저장한 뒤 장소 2를 저장하기 전에 멈춘 사이, 보관함 항목 11과 20을 한 번에 지운다
            Future<?> save = holdSavingPlacesInOrder(pool, locked, release, login.memberId());
            locked.await();
            Future<Integer> deletion = pool.submit(() -> givenBearer(login.accessToken())
                    .queryParam("savedPlaceIds", "11,20")
                    .when().delete(SAVED_PLACES_PATH)
                    .then().extract().statusCode());
            awaitLockWaiter("FROM saved_places");

            // when
            release.countDown();

            // then: 삭제가 장소 ID 순서로 잠그면 장소 1에서 기다리므로, 저장이 장소 2까지 마친 뒤 삭제가 이어진다
            assertAll(
                    () -> assertThatCode(save::get).doesNotThrowAnyException(),
                    () -> assertThat(deletion.get()).isEqualTo(204)
            );
        } finally {
            pool.shutdownNow();
        }
    }

    private static ValidatableResponse savePlace(String accessToken, Long sharedMediaId, Long placeId) {
        return givenBearer(accessToken)
                .contentType(ContentType.JSON)
                .body("{\"sharedMediaId\":" + sharedMediaId + ",\"placeId\":" + placeId + "}")
                .when().post(SAVED_PLACES_PATH)
                .then();
    }

    /**
     * 게시물 행을 FOR UPDATE로 잠근 채 공유를 지운 것으로 표시하고, release가 열릴 때까지 기다렸다가 커밋한다.
     * 게시글 삭제가 게시물을 잠근 사이에 저장 요청이 들어오는 상황을 만든다.
     */
    private Future<?> holdMediaLockWhileDeletingShare(
            ExecutorService pool,
            CountDownLatch locked,
            CountDownLatch release
    ) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        return pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
            jdbcTemplate.queryForObject("SELECT id FROM media WHERE id = ? FOR UPDATE", Long.class, 21L);
            jdbcTemplate.update("UPDATE shared_media SET deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?", 1L);
            locked.countDown();
            awaitLatch(release);
        }));
    }

    /**
     * 체크 켜기를 트랜잭션 안에서 실행해 게시물 잠금과 새 보관함 항목을 쥔 채 release가 열릴 때까지 기다렸다가 커밋한다.
     * 체크 켜기가 게시물을 먼저 잠근 사이에 게시글 삭제가 들어오는 상황을 만든다.
     */
    private Future<?> holdCheckOnBeforeCommit(
            ExecutorService pool,
            CountDownLatch locked,
            CountDownLatch release,
            Long memberId
    ) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
            savedPlaceService.createSavedPlace(memberId, new SavedPlaceCreateRequest(1L, 1L));
            locked.countDown();
            awaitLatch(release);
        }));
    }

    /**
     * 장소 1을 저장한 뒤 release가 열릴 때까지 기다렸다가 장소 2를 저장하고 커밋한다.
     * 공유와 추출 완료의 저장(savePlacesFromShare)이 장소 ID 오름차순으로 저장하는 사이에 삭제가 들어오는 상황을 만든다.
     */
    private Future<?> holdSavingPlacesInOrder(
            ExecutorService pool,
            CountDownLatch locked,
            CountDownLatch release,
            Long memberId
    ) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        Instant savedAt = SHARED_AT.plusSeconds(60);
        return pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
            savedPlaceDao.saveOrUpdate(new SavedPlace(memberId, 1L, savedAt));
            locked.countDown();
            awaitLatch(release);
            savedPlaceDao.saveOrUpdate(new SavedPlace(memberId, 2L, savedAt));
        }));
    }

    /**
     * 요청이 잠금을 기다리는 중인지 서버 프로세스 목록으로 확인한다.
     * 같은 DB 사용자의 연결이라 PROCESS 권한 없이도 보이며, 잠금을 기다리는 문장은 Info에 그대로 남는다.
     */
    private void awaitLockWaiter(String from) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        List<String> statements = List.of();
        while (System.nanoTime() < deadline) {
            statements = jdbcTemplate.queryForList("SHOW FULL PROCESSLIST").stream()
                    .map(row -> row.get("Info"))
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .filter(info -> info.contains(from))
                    .filter(info -> info.contains("FOR UPDATE") || info.contains("DELETE"))
                    .toList();
            if (!statements.isEmpty()) {
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("요청이 잠금을 기다리지 않습니다. 보인 문장: " + statements);
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("잠금을 풀라는 신호를 받지 못했습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }

    /**
     * 게시물 21에서 카페 온월(장소 1)과 윤숲 후르츠산도(장소 2)가 추출됐고, 경복궁(장소 3)은 추출되지 않았다.
     */
    private void insertMediaWithTwoPlaces() {
        insertThreePlaces();
        insertMedia(jdbcTemplate, 21L, "성수 감성 카페 모음", "reel21.jpg", "@seongsu_cafe");
        insertMediaPlace(jdbcTemplate, 1L, 21L, 1L);
        insertMediaPlace(jdbcTemplate, 2L, 21L, 2L);
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
