package com.yeogidam.media.controller;

import com.yeogidam.media.dto.request.PlaceDiscardRequest;
import com.yeogidam.media.dto.request.PlaceSelectionRequest;
import com.yeogidam.media.dto.request.InstagramMediaCreateRequest;
import com.yeogidam.media.dto.response.InstagramMediaDetailResponse;
import com.yeogidam.media.dto.response.InstagramMediaReceiptResponse;
import com.yeogidam.media.dto.response.InstagramMediaResponses;
import com.yeogidam.media.service.PlaceSelectionService;
import com.yeogidam.media.service.InstagramMediaService;
import com.yeogidam.media.service.InstagramMediaReportService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/media")
public class InstagramMediaController {

    private final InstagramMediaService instagramMediaService;
    private final PlaceSelectionService placeSelectionService;
    private final InstagramMediaReportService instagramMediaReportService;

    public InstagramMediaController(
            InstagramMediaService instagramMediaService,
            PlaceSelectionService placeSelectionService,
            InstagramMediaReportService instagramMediaReportService
    ) {
        this.instagramMediaService = instagramMediaService;
        this.placeSelectionService = placeSelectionService;
        this.instagramMediaReportService = instagramMediaReportService;
    }

    @PostMapping
    public ResponseEntity<InstagramMediaReceiptResponse> createInstagramMedia(
            @RequestHeader("X-User-Id") Long userId,
            @Valid @RequestBody InstagramMediaCreateRequest request
    ) {
        InstagramMediaReceiptResponse response = instagramMediaService.createInstagramMedia(userId, request);
        return ResponseEntity.created(URI.create("/media/" + response.id())).body(response);
    }

    @GetMapping
    public ResponseEntity<InstagramMediaResponses> readInstagramMedias(
            @RequestHeader("X-User-Id") Long userId
    ) {
        return ResponseEntity.ok(instagramMediaService.readInstagramMedias(userId));
    }

    @GetMapping("/{shareId}")
    public ResponseEntity<InstagramMediaDetailResponse> readInstagramMedia(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long shareId
    ) {
        return ResponseEntity.ok(instagramMediaService.readInstagramMedia(userId, shareId));
    }

    @PostMapping("/{shareId}/extraction-retries")
    public ResponseEntity<Void> createExtractionRetry(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long shareId
    ) {
        instagramMediaService.createExtractionRetry(userId, shareId);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/{shareId}/place-selections")
    public ResponseEntity<Void> createPlaceSelection(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long shareId,
            @Valid @RequestBody PlaceSelectionRequest request
    ) {
        placeSelectionService.createPlaceSelection(userId, shareId, request);
        return ResponseEntity.created(URI.create("/media/" + shareId + "/place-selections")).build();
    }

    @PostMapping("/{shareId}/place-discards")
    public ResponseEntity<Void> createPlaceDiscard(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long shareId,
            @Valid @RequestBody PlaceDiscardRequest request
    ) {
        placeSelectionService.createPlaceDiscard(userId, shareId, request);
        return ResponseEntity.created(URI.create("/media/" + shareId + "/place-discards")).build();
    }

    @PostMapping("/{shareId}/reports")
    public ResponseEntity<Void> createReport(
            @RequestHeader("X-User-Id") Long userId,
            @PathVariable Long shareId
    ) {
        instagramMediaReportService.createReport(userId, shareId);
        return ResponseEntity.created(URI.create("/media/" + shareId + "/reports")).build();
    }
}
