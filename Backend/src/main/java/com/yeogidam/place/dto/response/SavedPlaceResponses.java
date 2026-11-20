package com.yeogidam.place.dto.response;

import com.yeogidam.place.domain.PlaceCategoryClassifier;
import com.yeogidam.place.repository.SavedPlaceFolderProjections;
import com.yeogidam.place.repository.SavedPlaceProjections;
import java.util.List;
import java.util.function.UnaryOperator;

public record SavedPlaceResponses(
        List<SavedPlaceResponse> savedPlaces
) {
    public static SavedPlaceResponses from(
            SavedPlaceProjections places,
            SavedPlaceFolderProjections folders,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        List<SavedPlaceResponse> responses = places.places().stream()
                .map(place -> SavedPlaceResponse.from(place, thumbnailUrlResolver.apply(place.thumbnailKey()),
                        PlaceCategoryClassifier.classify(place.category()), folders.folderIdsOf(place.savedPlaceId())))
                .toList();
        return new SavedPlaceResponses(responses);
    }
}
