package com.yeogidam.place.service;

import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.dto.response.PlaceCategoryResponse;
import com.yeogidam.place.dto.response.PlaceCategoryResponses;
import java.util.Arrays;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PlaceCategoryService {

    public PlaceCategoryResponses readPlaceCategories() {
        List<PlaceCategoryResponse> categories = Arrays.stream(PlaceCategory.values())
                .map(PlaceCategoryResponse::from)
                .toList();
        return new PlaceCategoryResponses(categories);
    }
}
