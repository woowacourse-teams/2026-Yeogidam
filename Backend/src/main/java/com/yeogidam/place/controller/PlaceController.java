package com.yeogidam.place.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.service.PlaceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/places")
public class PlaceController implements PlaceApiDocs {

    private final PlaceService placeService;

    @Override
    @GetMapping("/{placeId}/media")
    public ResponseEntity<PlaceMediaResponses> readPlaceMedia(@LoginMember Long memberId,
                                                              @PathVariable Long placeId) {
        PlaceMediaResponses response = placeService.readPlaceMedia(memberId, placeId);
        return ResponseEntity.ok()
                .body(response);
    }
}
