package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.SavedMediaResponses;
import com.yeogidam.media.share.service.SavedMediaService;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/saved-media")
public class SavedMediaController implements SavedMediaApiDocs {

    private final SavedMediaService savedMediaService;

    @Override
    @GetMapping
    public ResponseEntity<SavedMediaResponses> readSavedMedia(
            @LoginMember Long memberId,
            @RequestParam(required = false) Instant cursorCreatedAt,
            @RequestParam(required = false) Long cursorId
    ) {
        SavedMediaResponses response = savedMediaService.readSavedMedia(memberId, cursorCreatedAt, cursorId);
        return ResponseEntity.ok()
                .body(response);
    }
}
