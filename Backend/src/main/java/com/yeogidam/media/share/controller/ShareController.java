package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.ShareResultResponse;
import com.yeogidam.media.share.service.ShareService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/shares")
@RequiredArgsConstructor
public class ShareController implements ShareApiDocs {

    private final ShareService shareService;

    @Override
    @GetMapping("/{sharedMediaId}")
    public ResponseEntity<ShareResultResponse> readShareResult(
            @LoginMember Long memberId,
            @PathVariable Long sharedMediaId
    ) {
        ShareResultResponse response = shareService.readShareResult(memberId, sharedMediaId);
        return ResponseEntity.ok()
                .body(response);
    }
}
