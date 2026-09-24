package com.yeogidam.auth.controller;

import com.yeogidam.auth.dto.request.LoginRequest;
import com.yeogidam.auth.dto.request.RefreshTokenRequest;
import com.yeogidam.auth.dto.response.LoginResponse;
import com.yeogidam.auth.dto.response.TokenResponse;
import com.yeogidam.auth.service.AuthService;
import com.yeogidam.member.domain.OAuthProvider;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController implements AuthApiDocs {

    private final AuthService authService;

    @Override
    @PostMapping("/logins/kakao")
    public ResponseEntity<LoginResponse> createKakaoLogin(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.createLogin(OAuthProvider.KAKAO, request);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @PostMapping("/logins/google")
    public ResponseEntity<LoginResponse> createGoogleLogin(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.createLogin(OAuthProvider.GOOGLE, request);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @PostMapping("/logins/apple")
    public ResponseEntity<LoginResponse> createAppleLogin(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = authService.createLogin(OAuthProvider.APPLE, request);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @PostMapping("/token-refreshes")
    public ResponseEntity<TokenResponse> reissueTokens(@Valid @RequestBody RefreshTokenRequest request) {
        TokenResponse response = authService.reissueTokens(request);
        return ResponseEntity.ok()
                .body(response);
    }

    @Override
    @PostMapping("/logouts")
    public ResponseEntity<Void> createLogout(@Valid @RequestBody RefreshTokenRequest request) {
        authService.createLogout(request);
        return ResponseEntity.noContent()
                .build();
    }
}
