package com.yeogidam.place.domain;

import com.yeogidam.search.domain.SearchQuery;
import java.util.Arrays;
import java.util.List;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PlaceCategory {

    CAFE("카페"),
    DESSERT("디저트"),
    KOREAN("한식"),
    WESTERN("양식"),
    JAPANESE("일식"),
    CHINESE("중식"),
    BUNSIK("분식"),
    BAR("술집"),
    SPECIALTY("별미"),
    CULTURE_LEISURE("문화/여가"),
    ETC("기타");

    private final String name;

    public static boolean hasAnyNameContaining(List<String> words) {
        return Arrays.stream(values())
                .anyMatch(category -> words.stream().anyMatch(category::hasNameContaining));
    }

    public boolean hasNameContaining(String word) {
        return SearchQuery.normalizeForMatching(name).contains(word);
    }

    public String getCode() {
        return name();
    }
}
