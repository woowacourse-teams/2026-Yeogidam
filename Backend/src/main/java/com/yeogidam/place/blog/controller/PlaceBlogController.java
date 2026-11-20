package com.yeogidam.place.blog.controller;

import com.yeogidam.place.blog.dto.response.PlaceBlogResponses;
import com.yeogidam.place.blog.service.PlaceBlogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/places")
public class PlaceBlogController implements PlaceBlogApiDocs {

    private final PlaceBlogService placeBlogService;

    @Override
    @GetMapping("/{placeId}/blogs")
    public ResponseEntity<PlaceBlogResponses> readPlaceBlogs(@PathVariable Long placeId) {
        PlaceBlogResponses response = placeBlogService.readPlaceBlogs(placeId);
        return ResponseEntity.ok()
                .body(response);
    }
}
