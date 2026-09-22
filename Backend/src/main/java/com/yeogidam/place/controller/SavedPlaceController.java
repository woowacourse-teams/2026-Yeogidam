package com.yeogidam.place.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.service.SavedPlaceService;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/saved-places")
public class SavedPlaceController implements SavedPlaceApiDocs {

    private final SavedPlaceService savedPlaceService;

    @Override
    @GetMapping
    public ResponseEntity<SavedPlaceResponses> readSavedPlaces(@LoginMember Long memberId) {
        SavedPlaceResponses response = savedPlaceService.readSavedPlaces(memberId);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @DeleteMapping
    public ResponseEntity<Void> deleteSavedPlaces(@LoginMember Long memberId,
                                                  @RequestParam Optional<List<Long>> savedPlaceIds) {
        savedPlaceService.deleteSavedPlaces(memberId, savedPlaceIds.orElseGet(List::of));
        return ResponseEntity.noContent()
                .build();
    }
}
