package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.ExtractionRetryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryPlaceResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.dto.response.ShareResponse;
import com.yeogidam.media.share.service.ShareReportService;
import com.yeogidam.media.share.service.ShareService;
import java.time.Instant;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/shares")
public class ShareController implements ShareApiDocs {

    private final ShareService shareService;
    private final ShareReportService shareReportService;

    @Override
    @PostMapping
    public ResponseEntity<ShareResponse> createShare(
            @LoginMember Long memberId,
            @Valid @RequestBody ShareRequest request
    ) {
        ShareResponse response = shareService.createShare(memberId, request);
        return ResponseEntity.accepted()
                .body(response);
    }

    @Override
    @PostMapping("/{sharedMediaId}/extraction-retries")
    public ResponseEntity<ExtractionRetryResponse> createExtractionRetry(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        ExtractionRetryResponse response = shareService.createExtractionRetry(memberId, sharedMediaId);
        return ResponseEntity.accepted()
                .body(response);
    }

    @Override
    @PostMapping("/{sharedMediaId}/reports")
    public ResponseEntity<Void> createReport(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        shareReportService.createReport(memberId, sharedMediaId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .build();
    }

    @Override
    @GetMapping
    public ResponseEntity<ShareHistoryResponses> readShareHistory(
            @LoginMember Long memberId,
            @RequestParam(required = false) Instant cursorCreatedAt,
            @RequestParam(required = false) Long cursorId
    ) {
        ShareHistoryResponses response = shareService.readShareHistory(memberId, cursorCreatedAt, cursorId);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @GetMapping("/{sharedMediaId}/places")
    public ResponseEntity<ShareHistoryPlaceResponses> readShareHistoryPlaces(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        ShareHistoryPlaceResponses response = shareService.readShareHistoryPlaces(memberId, sharedMediaId);
        return ResponseEntity.ok()
                .body(response);
    }
}
