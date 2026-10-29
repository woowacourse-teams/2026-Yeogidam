package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class PlaceCategoryClassifierTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "음식점 > 카페 > 테마카페 > 디저트카페 | CAFE",
            "음식점 > 간식 > 제과,베이커리 | DESSERT",
            "음식점 > 한식 > 해물,생선 | KOREAN",
            "음식점 > 양식 > 햄버거 | WESTERN",
            "음식점 > 일식 > 돈까스,우동 | JAPANESE",
            "음식점 > 중식 > 중국요리 | CHINESE",
            "음식점 > 분식 > 떡볶이 | BUNSIK",
            "음식점 > 술집 > 일본식주점 | BAR"
    })
    void 음식점_8종은_하위_이름과_관계없이_두번째_마디로_분류한다(String category, PlaceCategory expected) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"음식점 > 패스트푸드", "음식점 > 뷔페 > 한식뷔페"})
    void 음식점_8종에_없는_두번째_마디는_별미로_분류한다(String category) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.SPECIALTY);
    }

    @Test
    void 두번째_마디가_없는_음식점도_별미로_분류한다() {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify("음식점");

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.SPECIALTY);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "문화,예술 > 문화시설 > 미술관",
            "여행 > 숙박 > 호텔",
            "스포츠,레저 > 골프 > 골프장",
            "이슈 > 이벤트 > 팝업스토어",
            "교육,학문 > 학습시설 > 도서관",
            "가정,생활 > 여가시설 > 만화방 > 만화카페",
            "가정,생활 > 목욕탕,사우나 > 찜질방",
            "가정,생활 > 복합쇼핑몰",
            "가정,생활 > 백화점 > 롯데백화점",
            "가정,생활 > 생활용품점 > 인테리어장식판매",
            "가정,생활 > 문구,사무용품"
    })
    void 허용한_경로와_그_하위는_문화여가로_분류한다(String category) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.CULTURE_LEISURE);
    }

    @Test
    void 한_마디_한식도_한식으로_분류한다() {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify("한식");

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.KOREAN);
    }

    @Test
    void 한_마디_관광명소는_문화여가로_분류한다() {
        String category = "관광명소";

        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.CULTURE_LEISURE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"돈까스,우동", "가정,생활 > 미용 > 네일샵"})
    void 대응하지_않는_한_마디와_허용하지_않은_하위_경로는_기타로_분류한다(String category) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.ETC);
    }

    @Test
    void 각_마디의_앞뒤_공백을_제거하고_분류한다() {
        String category = "  음식점  >  카페  >  커피전문점  ";

        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.CAFE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"음식점 >", "음식점 >   > 카페"})
    void 마지막이나_중간_마디가_비어_있으면_기타로_분류한다(String category) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.ETC);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = "   ")
    void 비어_있는_입력은_기타로_분류한다(String category) {
        // when
        PlaceCategory result = PlaceCategoryClassifier.classify(category);

        // then
        assertThat(result)
                .isEqualTo(PlaceCategory.ETC);
    }
}
