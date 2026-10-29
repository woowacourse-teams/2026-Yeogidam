package com.yeogidam.place.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

public final class PlaceCategoryClassifier {

    private static final Map<String, PlaceCategory> FOOD_CATEGORIES = Map.of(
            "카페", PlaceCategory.CAFE,
            "간식", PlaceCategory.DESSERT,
            "한식", PlaceCategory.KOREAN,
            "양식", PlaceCategory.WESTERN,
            "일식", PlaceCategory.JAPANESE,
            "중식", PlaceCategory.CHINESE,
            "분식", PlaceCategory.BUNSIK,
            "술집", PlaceCategory.BAR
    );
    private static final List<List<String>> CULTURE_LEISURE_PATHS = List.of(
            List.of("문화,예술"),
            List.of("여행"),
            List.of("스포츠,레저"),
            List.of("이슈", "이벤트"),
            List.of("교육,학문", "학습시설", "도서관"),
            List.of("가정,생활", "여가시설"),
            List.of("가정,생활", "목욕탕,사우나"),
            List.of("가정,생활", "복합쇼핑몰"),
            List.of("가정,생활", "백화점"),
            List.of("가정,생활", "생활용품점"),
            List.of("가정,생활", "문구,사무용품")
    );

    private PlaceCategoryClassifier() {
    }

    public static PlaceCategory classify(String category) {
        if (category == null || category.isBlank()) {
            return PlaceCategory.ETC;
        }
        List<String> segments = Arrays.stream(category.split(">", -1))
                .map(String::strip)
                .toList();
        return classifySegments(segments);
    }

    private static PlaceCategory classifySegments(List<String> segments) {
        if (segments.contains("")) {
            return PlaceCategory.ETC;
        }
        if (segments.getFirst().equals("음식점")) {
            return classifyFood(segments);
        }
        if (isCultureLeisure(segments)) {
            return PlaceCategory.CULTURE_LEISURE;
        }
        if (segments.size() == 1) {
            return FOOD_CATEGORIES.getOrDefault(segments.getFirst(), PlaceCategory.ETC);
        }
        return PlaceCategory.ETC;
    }

    private static PlaceCategory classifyFood(List<String> segments) {
        if (segments.size() == 1) {
            return PlaceCategory.SPECIALTY;
        }
        return FOOD_CATEGORIES.getOrDefault(segments.get(1), PlaceCategory.SPECIALTY);
    }

    private static boolean isCultureLeisure(List<String> segments) {
        if (segments.equals(List.of("관광명소"))) {
            return true;
        }
        return CULTURE_LEISURE_PATHS.stream()
                .anyMatch(path -> segments.size() >= path.size()
                        && segments.subList(0, path.size()).equals(path));
    }
}
