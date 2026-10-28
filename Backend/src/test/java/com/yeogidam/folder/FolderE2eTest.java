package com.yeogidam.folder;

import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 목록 조회를 실제 HTTP로 검증하되 정렬과 읽은 값의 세부는 FolderDaoTest에 맡기고, 응답 모양(감싸는 키, 필드 이름)과
 * 인가가 응답에 드러나는지만 확인한다. 회원은 로그인으로 만들고 폴더 행은 SQL fixture로 given에서 넣는다.
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
}
