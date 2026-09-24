package com.yeogidam.auth.service;

import com.yeogidam.auth.domain.session.RefreshSession;
import com.yeogidam.auth.domain.token.RefreshTokenClaims;
import com.yeogidam.auth.domain.token.Token;
import com.yeogidam.auth.dto.request.RefreshTokenRequest;
import com.yeogidam.auth.dto.response.TokenResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.exception.RefreshTokenMismatchException;
import com.yeogidam.auth.infrastructure.jwt.JwtTokenProvider;
import com.yeogidam.auth.repository.RefreshSessionDao;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TokenManager {

    private final Clock clock;
    private final JwtTokenProvider tokenProvider;
    private final RefreshSessionDao refreshSessionDao;

    @Transactional
    public TokenResponse createTokens(Long memberId) {
        String sessionId = UUID.randomUUID().toString();
        Token accessToken = tokenProvider.createAccessToken(memberId);
        Token refreshToken = tokenProvider.createRefreshToken(memberId, sessionId);
        refreshSessionDao.save(new RefreshSession(sessionId, memberId, hashToken(refreshToken.value()),
                refreshToken.expiresAt(), false));
        return TokenResponse.from(accessToken, refreshToken);
    }

    @Transactional(noRollbackFor = RefreshTokenMismatchException.class)
    public TokenResponse createTokenRefresh(RefreshTokenRequest request) {
        RefreshTokenClaims claims = tokenProvider.parseRefreshToken(request.refreshToken());
        RefreshSession session = getActiveSession(claims);
        String tokenHash = hashToken(request.refreshToken());
        if (session.isTokenMismatch(tokenHash)) {
            refreshSessionDao.update(session.revoke());
            throw new RefreshTokenMismatchException();
        }
        Token refreshToken = tokenProvider.reissueRefreshToken(
                session.getMemberId(), session.getSessionId(), session.getExpiresAt());
        TokenResponse tokens = TokenResponse.from(tokenProvider.createAccessToken(session.getMemberId()), refreshToken);
        refreshSessionDao.update(session.rotate(hashToken(tokens.refreshToken())));
        return tokens;
    }

    private RefreshSession getActiveSession(RefreshTokenClaims claims) {
        RefreshSession session = refreshSessionDao.findBySessionId(claims.sessionId())
                .orElseThrow(() -> new AuthException(AuthErrorCode.INVALID_TOKEN));
        if (!session.canRefresh(claims.memberId(), clock.instant())) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        return session;
    }

    @Transactional
    public void revokeRefreshSession(RefreshTokenRequest request) {
        RefreshTokenClaims claims = tokenProvider.parseRefreshToken(request.refreshToken());
        RefreshSession session = refreshSessionDao.findBySessionId(claims.sessionId())
                .orElseThrow(() -> new AuthException(AuthErrorCode.INVALID_TOKEN));
        if (session.isOwnedBy(claims.memberId())) {
            refreshSessionDao.update(session.revoke());
            return;
        }
        throw new AuthException(AuthErrorCode.INVALID_TOKEN);
    }

    private String hashToken(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다.", exception);
        }
    }
}
