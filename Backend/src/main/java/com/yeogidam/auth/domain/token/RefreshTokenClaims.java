package com.yeogidam.auth.domain.token;

public record RefreshTokenClaims(Long memberId, String sessionId) {
}
