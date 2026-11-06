package com.yeogidam.place.repository;

import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.domain.PlaceCategoryClassifier;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 내 저장 장소를 화면의 카테고리로 묶고, 검색 단어가 카테고리 이름에 포함된 저장 장소 ID를 제공한다.
 */
public class SavedPlaceCategoryProjections {

    private final Map<PlaceCategory, List<Long>> savedPlaceIdsByCategory;

    public SavedPlaceCategoryProjections(List<SavedPlaceCategoryProjection> places) {
        this.savedPlaceIdsByCategory = places.stream()
                .collect(Collectors.groupingBy(
                        place -> PlaceCategoryClassifier.classify(place.category()),
                        () -> new EnumMap<>(PlaceCategory.class),
                        Collectors.mapping(SavedPlaceCategoryProjection::savedPlaceId, Collectors.toUnmodifiableList())
                ));
    }

    public List<Long> savedPlaceIdsMatching(String word) {
        return savedPlaceIdsByCategory.entrySet().stream()
                .filter(entry -> entry.getKey().hasNameContaining(word))
                .flatMap(entry -> entry.getValue().stream())
                .toList();
    }
}
