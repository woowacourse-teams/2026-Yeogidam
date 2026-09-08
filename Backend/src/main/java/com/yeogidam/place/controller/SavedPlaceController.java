package com.yeogidam.place.controller;

import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.service.SavedPlaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/saved-places")
public class SavedPlaceController {

    private final SavedPlaceService savedPlaceService;

    public SavedPlaceController(SavedPlaceService savedPlaceService) {
        this.savedPlaceService = savedPlaceService;
    }

    @GetMapping
    public ResponseEntity<SavedPlaceResponses> readSavedPlaces(
            @RequestHeader("X-Member-Id") Long memberId
    ) {
        return ResponseEntity.ok(savedPlaceService.readSavedPlaces(memberId));
    }

    @GetMapping("/{placeId}/media")
    public ResponseEntity<PlaceMediaResponses> readSavedPlaceMedia(
            @RequestHeader("X-Member-Id") Long memberId,
            @PathVariable Long placeId
    ) {
        return ResponseEntity.ok(savedPlaceService.readSavedPlaceMedia(memberId, placeId));
    }

    @DeleteMapping("/{placeId}")
    public ResponseEntity<Void> deleteSavedPlace(
            @RequestHeader("X-Member-Id") Long memberId,
            @PathVariable Long placeId
    ) {
        savedPlaceService.deleteSavedPlace(memberId, placeId);
        return ResponseEntity.noContent().build();
    }
}
