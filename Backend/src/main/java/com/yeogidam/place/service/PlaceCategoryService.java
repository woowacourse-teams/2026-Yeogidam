package com.yeogidam.place.service;

import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.dto.response.PlaceCategoryResponses;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class PlaceCategoryService {

    public PlaceCategoryResponses readPlaceCategories() {
        List<PlaceCategory> categories = List.of(PlaceCategory.values());
        return PlaceCategoryResponses.from(categories);
    }
}
