package com.yeogidam.auth.controller;

import com.yeogidam.auth.dto.response.AuthorizationUrlResponse;
import com.yeogidam.auth.service.OAuthAuthorizationService;
import com.yeogidam.member.domain.OAuthProvider;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/oauth")
public class OAuthAuthorizationController implements OAuthAuthorizationApiDocs {

    private final OAuthAuthorizationService oauthAuthorizationService;

    @Override
    @GetMapping("/kakao/authorize")
    public ResponseEntity<AuthorizationUrlResponse> readKakaoAuthorizationUrl() {
        AuthorizationUrlResponse response = oauthAuthorizationService.readKakaoAuthorizationUrl();
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @GetMapping("/google/authorize")
    public ResponseEntity<AuthorizationUrlResponse> readGoogleAuthorizationUrl() {
        AuthorizationUrlResponse response = oauthAuthorizationService.readGoogleAuthorizationUrl();
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @GetMapping("/kakao/callback")
    public ResponseEntity<Void> readKakaoCallback(
            @RequestParam(required = false) String code,
            @RequestParam String state,
            @RequestParam(required = false) String error
    ) {
        URI appCallbackUri = oauthAuthorizationService.readAppCallbackUri(OAuthProvider.KAKAO, code, state, error);
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(appCallbackUri)
                .build();
    }

    @Override
    @GetMapping("/google/callback")
    public ResponseEntity<Void> readGoogleCallback(
            @RequestParam(required = false) String code,
            @RequestParam String state,
            @RequestParam(required = false) String error
    ) {
        URI appCallbackUri = oauthAuthorizationService.readAppCallbackUri(OAuthProvider.GOOGLE, code, state, error);
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(appCallbackUri)
                .build();
    }
}
