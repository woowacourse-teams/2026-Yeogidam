package com.yeogidam.place.controller;

import com.yeogidam.place.dto.response.PlaceReelResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.service.SavedPlaceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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
    public ResponseEntity<SavedPlaceResponses> readSavedPlaces() {
        return ResponseEntity.ok(savedPlaceService.readSavedPlaces());
    }

    @GetMapping("/{placeId}/reels")
    public ResponseEntity<PlaceReelResponses> readSavedPlaceReels(
            @PathVariable Long placeId
    ) {
        return ResponseEntity.ok(savedPlaceService.readSavedPlaceReels(placeId));
    }

    @DeleteMapping("/{placeId}")
    public ResponseEntity<Void> deleteSavedPlace(
            @PathVariable Long placeId
    ) {
        savedPlaceService.deleteSavedPlace(placeId);
        return ResponseEntity.noContent().build();
    }
}
