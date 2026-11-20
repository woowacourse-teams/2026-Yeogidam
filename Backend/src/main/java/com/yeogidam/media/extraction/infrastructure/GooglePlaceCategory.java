package com.yeogidam.media.extraction.infrastructure;

import static java.util.Map.entry;

import java.util.List;
import java.util.Map;

/**
 * 구글 장소 유형을 카카오 업종 경로 표기로 바꾼다. 칩 분류(PlaceCategoryClassifier)가 카카오 업종 경로를 읽기 때문이다.
 * 대응하지 못한 음식점은 「음식점」이라 칩에서 별미가 되고, 나머지 유형은 null이라 칩에서 기타가 된다.
 */
final class GooglePlaceCategory {

    private static final String RESTAURANT = "음식점";

    private static final Map<String, String> KAKAO_CATEGORIES = Map.ofEntries(
            entry("cafe", "음식점 > 카페"),
            entry("coffee_shop", "음식점 > 카페"),
            entry("tea_house", "음식점 > 카페"),
            entry("bakery", "음식점 > 간식"),
            entry("dessert_shop", "음식점 > 간식"),
            entry("dessert_restaurant", "음식점 > 간식"),
            entry("ice_cream_shop", "음식점 > 간식"),
            entry("confectionery", "음식점 > 간식"),
            entry("donut_shop", "음식점 > 간식"),
            entry("chocolate_shop", "음식점 > 간식"),
            entry("korean_restaurant", "음식점 > 한식"),
            entry("japanese_restaurant", "음식점 > 일식"),
            entry("sushi_restaurant", "음식점 > 일식"),
            entry("ramen_restaurant", "음식점 > 일식"),
            entry("chinese_restaurant", "음식점 > 중식"),
            entry("italian_restaurant", "음식점 > 양식"),
            entry("french_restaurant", "음식점 > 양식"),
            entry("american_restaurant", "음식점 > 양식"),
            entry("spanish_restaurant", "음식점 > 양식"),
            entry("pizza_restaurant", "음식점 > 양식"),
            entry("steak_house", "음식점 > 양식"),
            entry("hamburger_restaurant", "음식점 > 양식"),
            entry("bar", "음식점 > 술집"),
            entry("pub", "음식점 > 술집"),
            entry("wine_bar", "음식점 > 술집"),
            entry("tourist_attraction", "관광명소"),
            entry("historical_landmark", "관광명소"),
            entry("museum", "문화,예술 > 문화시설 > 박물관"),
            entry("art_gallery", "문화,예술 > 문화시설 > 미술관"),
            entry("park", "여행 > 공원"),
            entry("amusement_park", "여행 > 테마파크"),
            entry("aquarium", "여행 > 아쿠아리움"),
            entry("zoo", "여행 > 동물원"),
            entry("lodging", "여행 > 숙박"),
            entry("hotel", "여행 > 숙박 > 호텔"),
            entry("shopping_mall", "가정,생활 > 복합쇼핑몰"),
            entry("department_store", "가정,생활 > 백화점")
    );

    private GooglePlaceCategory() {
    }

    // 대표 유형(primaryType)을 먼저 보고, 없거나 대응하지 못하면 유형 목록(types)을 차례로 본다.
    // 대표 유형이 대응표에 없는 음식점(thai_restaurant 등)이면 유형 목록의 bar, cafe로 바꾸지 않고 별미로 본다.
    static String toKakaoCategory(String primaryType, List<String> types) {
        if (primaryType != null && KAKAO_CATEGORIES.containsKey(primaryType)) {
            return KAKAO_CATEGORIES.get(primaryType);
        }
        if (isRestaurant(primaryType)) {
            return RESTAURANT;
        }
        for (String type : types) {
            if (KAKAO_CATEGORIES.containsKey(type)) {
                return KAKAO_CATEGORIES.get(type);
            }
        }
        if (types.stream().anyMatch(GooglePlaceCategory::isRestaurant)) {
            return RESTAURANT;
        }
        return null;
    }

    private static boolean isRestaurant(String type) {
        return type != null && (type.equals("restaurant") || type.endsWith("_restaurant"));
    }
}
