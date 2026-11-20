package com.yeogidam.place.controller;

import com.yeogidam.place.dto.response.PlaceCategoryResponses;
import com.yeogidam.place.service.PlaceCategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/place-categories")
public class PlaceCategoryController implements PlaceCategoryApiDocs {

    private final PlaceCategoryService placeCategoryService;

    @Override
    @GetMapping
    public ResponseEntity<PlaceCategoryResponses> readPlaceCategories() {
        PlaceCategoryResponses response = placeCategoryService.readPlaceCategories();
        return ResponseEntity.ok()
                .body(response);
    }
}
