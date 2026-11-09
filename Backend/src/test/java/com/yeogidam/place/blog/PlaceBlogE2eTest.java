package com.yeogidam.place.blog;

import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.place.blog.domain.BlogPost;
import com.yeogidam.place.blog.domain.BlogSearchResult;
import com.yeogidam.place.blog.exception.PlaceBlogErrorCode;
import com.yeogidam.place.blog.exception.PlaceBlogException;
import com.yeogidam.place.blog.service.BlogSearcher;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 블로그 기능을 들어낼 때 테스트 폴더째 지울 수 있도록, 네이버 대신 쓰는 가짜 검색기를 E2E 클래스 안에 둔다.
 */
@Import(PlaceBlogE2eTest.FakeBlogSearcherConfiguration.class)
class PlaceBlogE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/places/{placeId}/blogs";
    private static final long PLACE_ID = 1L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FakeBlogSearcher blogSearcher;

    @BeforeEach
    void resetBlogSearcher() {
        blogSearcher.reset();
    }

    @Test
    void 장소_이름과_동으로_블로그_글_다섯_개를_검색해_결과_순서대로_돌려준다() {
        // given
        LoginResult login = loginAsKakao("place-blog-user");
        insertCafe();
        blogSearcher.respondWith(new BlogSearchResult("NAVER", List.of(
                new BlogPost("카페 온월 디저트 후기", "연남 산책", LocalDate.of(2026, 11, 2),
                        "https://blog.naver.com/walk/1"),
                new BlogPost("연남동 카페 온월", null, null, "https://blog.naver.com/diary/2"))));

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(HttpStatus.OK.value())
                .body("source", equalTo("NAVER"))
                .body("items[0].keySet()", containsInAnyOrder("title", "bloggerName", "postDate", "link"))
                .body("items[1].keySet()", containsInAnyOrder("title", "bloggerName", "postDate", "link"))
                .body("items.title", contains("카페 온월 디저트 후기", "연남동 카페 온월"))
                .body("items[0].bloggerName", equalTo("연남 산책"))
                .body("items[0].postDate", equalTo("2026-11-02"))
                .body("items[1].bloggerName", nullValue())
                .body("items[1].postDate", nullValue())
                .body("items.link", contains("https://blog.naver.com/walk/1", "https://blog.naver.com/diary/2"));
        assertThat(blogSearcher.requests()).containsExactly("카페 온월 연남동|5");
    }

    @Test
    void 존재하지_않는_장소를_조회하면_블로그를_검색하지_않고_404_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-blog-missing-user");

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceErrorCode.PLACE_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getCode()))
                .body("message", equalTo(PlaceErrorCode.PLACE_NOT_FOUND.getMessage()));
        assertThat(blogSearcher.requests()).isEmpty();
    }

    @Test
    void 블로그_검색에_실패하면_502_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-blog-failure-user");
        insertCafe();
        blogSearcher.fail();

        // when & then
        givenBearer(login.accessToken())
                .when().get(PATH, PLACE_ID)
                .then().statusCode(PlaceBlogErrorCode.BLOG_SEARCH_FAILED.getHttpStatus().value())
                .body("errorCode", equalTo(PlaceBlogErrorCode.BLOG_SEARCH_FAILED.getCode()))
                .body("message", equalTo(PlaceBlogErrorCode.BLOG_SEARCH_FAILED.getMessage()));
    }

    @Test
    void 토큰_없이_조회하면_401_예외를_던진다() {
        // when & then
        given()
                .when().get(PATH, PLACE_ID)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()));
    }

    private void insertCafe() {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, PLACE_ID, "place-blog-cafe", "카페 온월",
                "서울 마포구 연남동 239-49", new BigDecimal("37.5622"), new BigDecimal("126.9254"));
    }

    @TestConfiguration
    static class FakeBlogSearcherConfiguration {

        @Bean
        @Primary
        FakeBlogSearcher fakeBlogSearcher() {
            return new FakeBlogSearcher();
        }
    }

    /**
     * 네이버를 부르지 않고 정해 둔 결과를 돌려주며, 받은 요청을 「검색어|개수」로 남긴다.
     */
    static class FakeBlogSearcher implements BlogSearcher {

        private final AtomicReference<BlogSearchResult> result =
                new AtomicReference<>(new BlogSearchResult("NAVER", List.of()));
        private final AtomicBoolean failing = new AtomicBoolean();
        private final List<String> requests = new CopyOnWriteArrayList<>();

        @Override
        public BlogSearchResult search(String query, int size) {
            requests.add(query + "|" + size);
            if (failing.get()) {
                throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED);
            }
            return result.get();
        }

        void respondWith(BlogSearchResult value) {
            result.set(value);
        }

        void fail() {
            failing.set(true);
        }

        void reset() {
            result.set(new BlogSearchResult("NAVER", List.of()));
            failing.set(false);
            requests.clear();
        }

        List<String> requests() {
            return List.copyOf(requests);
        }
    }
}
