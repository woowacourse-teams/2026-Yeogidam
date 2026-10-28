package com.yeogidam.folder;

import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.http.ContentType;
import java.util.Map;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 목록 조회, 만들기, 수정, 삭제를 실제 HTTP로 검증하되 정렬과 읽은 값의 세부는 FolderDaoTest에 맡기고, 응답 모양(감싸는 키, 필드 이름)과
 * 상태 코드와 인가가 응답에 드러나는지만 확인한다. 회원은 로그인으로 만들고 폴더 행은 SQL fixture로 given에서 넣는다.
 */
class FolderE2eTest extends E2eTestSupport {

    private static final String FOLDERS_PATH = "/api/v1/folders";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 로그인하면_내_폴더를_만든_순서대로_조회한다() {
        // given: user-1은 폴더 1, 2를 만들었고 user-2는 폴더 3을 만들었다
        LoginResult login = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertFolder(jdbcTemplate, 2L, login.memberId(), "성수 카페", "TEAL");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 3L, other.memberId(), "남의 폴더", "PINK");

        // when & then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders", hasSize(2))
                .body("folders.folderId", contains(1, 2))
                .body("folders[0].name", equalTo("데이트 장소"))
                .body("folders[0].color", equalTo("RED"));
    }

    @Test
    void 만든_폴더가_없으면_빈_목록을_조회한다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders", hasSize(0));
    }

    @Test
    void 토큰_없이_폴더_목록을_조회하면_401_예외를_던진다() {
        given().when().get(FOLDERS_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 폴더를_만들면_만든_폴더를_돌려주고_목록에_보인다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when
        int folderId = givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "가보고 싶은 곳", "color", "GREEN"))
                .when().post(FOLDERS_PATH)
                .then().statusCode(201)
                .body("name", equalTo("가보고 싶은 곳"))
                .body("color", equalTo("GREEN"))
                .extract().jsonPath().getInt("folderId");

        // then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders.folderId", contains(folderId));
    }

    @Test
    void 폴더가_이미_10개면_400_예외를_던진다() {
        // given: user-1은 폴더 1부터 10까지 이미 만들었다
        LoginResult login = loginAsKakao("user-1");
        LongStream.rangeClosed(1, 10)
                .forEach(folderId -> insertFolder(jdbcTemplate, folderId, login.memberId(), "폴더 " + folderId, "RED"));

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "열한 번째 폴더", "color", "RED"))
                .when().post(FOLDERS_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("FOLDER400_001"));
    }

    @Test
    void 같은_이름으로_만들면_409_예외를_던진다() {
        // given: user-1은 폴더 1(데이트 장소)을 만들었다
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소", "color", "PINK"))
                .when().post(FOLDERS_PATH)
                .then().statusCode(409)
                .body("errorCode", equalTo("FOLDER409_001"));
    }

    @Test
    void 이름이나_색_없이_만들면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소"))
                .when().post(FOLDERS_PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_001"));
    }

    @Test
    void 토큰_없이_폴더를_만들면_401_예외를_던진다() {
        given().contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소", "color", "RED"))
                .when().post(FOLDERS_PATH)
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 내_폴더의_이름과_색을_바꾸면_목록에_반영된다() {
        // given: user-1은 폴더 1(데이트 장소, RED)을 만들었다
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 코스", "color", "PINK"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(204);

        // then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders[0].name", equalTo("데이트 코스"))
                .body("folders[0].color", equalTo("PINK"));
    }

    @Test
    void 이름은_그대로_두고_색만_바꿀_수_있다() {
        // given: user-1은 폴더 1(데이트 장소, RED)을 만들었다
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소", "color", "GREEN"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(204);

        // then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders[0].name", equalTo("데이트 장소"))
                .body("folders[0].color", equalTo("GREEN"));
    }

    @Test
    void 같은_이름의_폴더가_있으면_409_예외를_던진다() {
        // given: user-1은 폴더 1(데이트 장소)과 폴더 2(성수 카페)를 만들었고, 폴더 2의 이름을 데이트 장소로 바꾸려 한다
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, login.memberId(), "성수 카페", "TEAL");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소", "color", "TEAL"))
                .when().put(FOLDERS_PATH + "/2")
                .then().statusCode(409)
                .body("errorCode", equalTo("FOLDER409_001"));
    }

    @Test
    void 이름이_15자를_넘으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "가나다라마바사아자차카타파하가나", "color", "RED"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(400)
                .body("errorCode", equalTo("FOLDER400_002"));
    }

    @Test
    void 색이_정해진_7가지가_아니면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 장소", "color", "BLUE"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(400)
                .body("errorCode", equalTo("FOLDER400_003"));
    }

    @Test
    void 이름이나_색이_없으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 코스"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(400)
                .body("errorCode", equalTo("COMMON400_001"));
    }

    @Test
    void 없거나_남의_폴더를_바꾸면_404_예외를_던진다() {
        // given: user-2가 폴더 3을 만들었고, user-1이 남의 폴더 3과 없는 폴더 999를 바꾸려 한다
        LoginResult login = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertFolder(jdbcTemplate, 3L, other.memberId(), "남의 폴더", "PINK");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 코스", "color", "RED"))
                .when().put(FOLDERS_PATH + "/3")
                .then().statusCode(404)
                .body("errorCode", equalTo("FOLDER404_001"));
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 코스", "color", "RED"))
                .when().put(FOLDERS_PATH + "/999")
                .then().statusCode(404)
                .body("errorCode", equalTo("FOLDER404_001"));
    }

    @Test
    void 토큰_없이_폴더를_바꾸면_401_예외를_던진다() {
        given().contentType(ContentType.JSON)
                .body(Map.of("name", "데이트 코스", "color", "RED"))
                .when().put(FOLDERS_PATH + "/1")
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }

    @Test
    void 내_폴더를_지우면_목록에서_사라진다() {
        // given: user-1은 폴더 1, 2를 만들었다
        LoginResult login = loginAsKakao("user-1");
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, login.memberId(), "성수 카페", "TEAL");

        // when
        givenBearer(login.accessToken())
                .when().delete(FOLDERS_PATH + "/1")
                .then().statusCode(204);

        // then
        givenBearer(login.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders.folderId", contains(2));
    }

    @Test
    void 없거나_남의_폴더를_지워도_멱등하게_처리한다() {
        // given: user-2가 폴더 3을 만들었고, user-1이 남의 폴더 3과 없는 폴더 999를 지우려 한다
        LoginResult login = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertFolder(jdbcTemplate, 3L, other.memberId(), "남의 폴더", "PINK");

        // when
        givenBearer(login.accessToken())
                .when().delete(FOLDERS_PATH + "/3")
                .then().statusCode(204);
        givenBearer(login.accessToken())
                .when().delete(FOLDERS_PATH + "/999")
                .then().statusCode(204);

        // then: 남의 폴더 3은 그대로 남는다
        givenBearer(other.accessToken())
                .when().get(FOLDERS_PATH)
                .then().statusCode(200)
                .body("folders.folderId", contains(3));
    }

    @Test
    void 토큰_없이_폴더를_지우면_401_예외를_던진다() {
        given().when().delete(FOLDERS_PATH + "/1")
                .then().statusCode(401)
                .body("errorCode", equalTo("AUTH401_004"));
    }
}
