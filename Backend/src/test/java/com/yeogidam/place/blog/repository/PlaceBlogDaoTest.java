package com.yeogidam.place.blog.repository;

import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceBlogDao.class)
class PlaceBlogDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceBlogDao placeBlogDao;

    @Test
    void 블로그_검색어를_만들_장소_이름과_지번_주소를_읽는다() {
        // given
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 1L, "place-blog-1", "성수 카페",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));

        // when
        PlaceBlogQueryProjection place = placeBlogDao.findQueryByPlaceId(1L).orElseThrow();

        // then
        assertThat(place).isEqualTo(new PlaceBlogQueryProjection("성수 카페", "서울 성동구 성수동2가 1-1"));
    }

    @Test
    void 없는_장소의_블로그_검색어는_읽지_않는다() {
        assertThat(placeBlogDao.findQueryByPlaceId(1L)).isEmpty();
    }
}
