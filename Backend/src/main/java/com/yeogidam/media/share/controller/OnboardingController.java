package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.request.OnboardingShareRequest;
import com.yeogidam.media.share.dto.response.OnboardingShareResponse;
import com.yeogidam.media.share.service.ShareService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/onboarding")
public class OnboardingController implements OnboardingApiDocs {

    private final ShareService shareService;

    @Override
    @PostMapping("/saved-places")
    public ResponseEntity<OnboardingShareResponse> createOnboardingShare(
            @LoginMember Long memberId,
            @Valid @RequestBody OnboardingShareRequest request
    ) {
        OnboardingShareResponse response = shareService.createOnboardingShare(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response);
    }
}
