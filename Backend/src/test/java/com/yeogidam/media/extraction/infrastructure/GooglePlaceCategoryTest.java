package com.yeogidam.media.extraction.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.domain.PlaceCategoryClassifier;
import java.util.List;
import org.junit.jupiter.api.Test;

class GooglePlaceCategoryTest {

    @Test
    void 구글_유형을_칩_분류가_읽는_카카오_업종_경로로_바꾼다() {
        // when & then
        assertThat(classify("ramen_restaurant", List.of())).isEqualTo(PlaceCategory.JAPANESE);
        assertThat(classify("coffee_shop", List.of())).isEqualTo(PlaceCategory.CAFE);
        assertThat(classify("museum", List.of())).isEqualTo(PlaceCategory.CULTURE_LEISURE);
        assertThat(classify("hotel", List.of())).isEqualTo(PlaceCategory.CULTURE_LEISURE);
    }

    @Test
    void 대표_유형을_모르면_유형_목록에서_찾는다() {
        // when & then
        assertThat(classify(null, List.of("point_of_interest", "bakery"))).isEqualTo(PlaceCategory.DESSERT);
    }

    @Test
    void 대응하지_못한_음식점은_별미이고_나머지는_기타다() {
        // when & then
        assertThat(classify("thai_restaurant", List.of())).isEqualTo(PlaceCategory.SPECIALTY);
        assertThat(classify("spa", List.of("establishment"))).isEqualTo(PlaceCategory.ETC);
    }

    @Test
    void 대표_유형이_대응하지_못한_음식점이면_유형_목록의_술집이나_카페로_바꾸지_않는다() {
        // when & then
        assertThat(classify("thai_restaurant", List.of("thai_restaurant", "bar", "cafe", "restaurant")))
                .isEqualTo(PlaceCategory.SPECIALTY);
    }

    @Test
    void 대표_유형을_모르고_유형_목록에만_대응하지_못한_음식점이_있으면_음식점이다() {
        assertThat(GooglePlaceCategory.toKakaoCategory(null, List.of("point_of_interest", "thai_restaurant")))
                .isEqualTo("음식점");
    }

    @Test
    void 음식점도_대응표에_있는_유형도_아니면_업종을_비운다() {
        assertThat(GooglePlaceCategory.toKakaoCategory("spa", List.of("establishment"))).isNull();
    }

    private PlaceCategory classify(String primaryType, List<String> types) {
        return PlaceCategoryClassifier.classify(GooglePlaceCategory.toKakaoCategory(primaryType, types));
    }
}
