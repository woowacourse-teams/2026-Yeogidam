package com.yeogidam.place.blog.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 블로그 검색어가 다른 지역의 같은 이름 가게 글을 끌어오지 않도록, 지번 주소에서 동을 고르는 규칙을 DB 없이 확인한다.
 */
class PlaceBlogQueryProjectionTest {

    @ParameterizedTest
    @CsvSource({
            "서울 마포구 연남동 239-49, 카페 온도 연남동",
            "서울 성동구 성수동2가 1-1, 카페 온도 성수동",
            "서울 중구 을지로3가 296-1, 카페 온도 을지로",
            "서울 중구 남대문로5가 1, 카페 온도 남대문로",
            "서울 종로구 세종로 1-68, 카페 온도 세종로",
            "경기 고양시 일산동구 장항동 1, 카페 온도 장항동",
            "제주특별자치도 제주시 애월읍 애월리 1, 카페 온도 애월읍",
            "경기 양평군 양서면 목왕리 1, 카페 온도 양서면"
    })
    void 장소_이름_뒤에_지번_주소의_동을_붙이고_끝의_숫자와_가는_뗀다(String landLotAddress, String expected) {
        // given
        PlaceBlogQueryProjection place = new PlaceBlogQueryProjection("카페 온도", landLotAddress);

        // when & then
        assertThat(place.searchQuery()).isEqualTo(expected);
    }

    @Test
    void 장소_이름에_동과_같은_글자가_있어도_동을_붙인다() {
        // given
        PlaceBlogQueryProjection place = new PlaceBlogQueryProjection("우동집", "부산 해운대구 우동 1394");

        // when & then
        assertThat(place.searchQuery()).isEqualTo("우동집 우동");
    }

    @Test
    void 지번_주소에_동이_없으면_장소_이름만_쓴다() {
        // given
        PlaceBlogQueryProjection place = new PlaceBlogQueryProjection("카페 온도", "서울 마포구");

        // when & then
        assertThat(place.searchQuery()).isEqualTo("카페 온도");
    }
}
