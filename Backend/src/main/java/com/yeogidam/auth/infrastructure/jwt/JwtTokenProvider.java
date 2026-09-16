package com.yeogidam.auth.infrastructure.jwt;

import com.yeogidam.auth.config.JwtProperties;
import com.yeogidam.auth.domain.token.RefreshTokenClaims;
import com.yeogidam.auth.domain.token.Token;
import com.yeogidam.auth.domain.token.TokenType;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private static final String TOKEN_TYPE_CLAIM = "token_type";
    private static final String SESSION_ID_CLAIM = "sid";
    private static final long CLOCK_SKEW_SECONDS = 60;
    private static final JwsHeader JWT_HEADER = JwsHeader.with(MacAlgorithm.HS256).type("JWT").build();

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final JwtProperties properties;
    private final Clock clock;

    public Token createAccessToken(Long memberId) {
        Instant expiresAt = clock.instant()
                .truncatedTo(ChronoUnit.SECONDS)
                .plus(properties.accessTokenTtl());
        JwtClaimsSet claims = createCommonClaims(memberId, TokenType.ACCESS, expiresAt)
                .build();
        return signToken(claims);
    }

    public Token createRefreshToken(Long memberId, String sessionId) {
        Instant expiresAt = clock.instant()
                .truncatedTo(ChronoUnit.SECONDS)
                .plus(properties.refreshTokenTtl());
        JwtClaimsSet claims = createRefreshClaims(memberId, sessionId, expiresAt);
        return signToken(claims);
    }

    public Token reissueRefreshToken(Long memberId, String sessionId, Instant expiresAt) {
        JwtClaimsSet claims = createRefreshClaims(memberId, sessionId, expiresAt);
        return signToken(claims);
    }

    public Long parseAccessToken(String token) {
        Jwt jwt = decodeToken(token, TokenType.ACCESS);
        return Long.parseLong(jwt.getSubject());
    }

    public RefreshTokenClaims parseRefreshToken(String token) {
        Jwt jwt = decodeToken(token, TokenType.REFRESH);
        Object sessionId = jwt.getClaims()
                .get(SESSION_ID_CLAIM);
        if (!(sessionId instanceof String value) || value.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        long memberId = Long.parseLong(jwt.getSubject());
        return new RefreshTokenClaims(memberId, value);
    }

    private JwtClaimsSet createRefreshClaims(Long memberId, String sessionId, Instant expiresAt) {
        return createCommonClaims(memberId, TokenType.REFRESH, expiresAt)
                .claim(SESSION_ID_CLAIM, sessionId)
                .build();
    }

    private JwtClaimsSet.Builder createCommonClaims(Long memberId, TokenType type, Instant expiresAt) {
        Instant issuedAt = clock.instant()
                .truncatedTo(ChronoUnit.SECONDS);
        String tokenId = UUID.randomUUID().toString();
        return JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(memberId.toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .id(tokenId)
                .claim(TOKEN_TYPE_CLAIM, type.getValue());
    }

    private Token signToken(JwtClaimsSet claims) {
        Jwt jwt = encoder.encode(JwtEncoderParameters.from(JWT_HEADER, claims));
        return new Token(jwt.getTokenValue(), jwt.getExpiresAt());
    }

    private Jwt decodeToken(String token, TokenType expectedType) {
        if (token == null || token.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        try {
            Jwt jwt = decoder.decode(token);
            validateClaims(jwt, expectedType);
            return jwt;
        } catch (JwtException | IllegalArgumentException exception) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
    }

    private void validateClaims(Jwt jwt, TokenType expectedType) {
        String tokenType = jwt.getClaimAsString(TOKEN_TYPE_CLAIM);
        String tokenId = jwt.getId();
        if (!expectedType.getValue().equals(tokenType)) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        if (tokenId == null || tokenId.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        validateMemberId(jwt.getSubject());
        validateTimestamps(jwt);
    }

    private void validateMemberId(String subject) {
        if (subject == null || subject.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        try {
            if (Long.parseLong(subject) <= 0) {
                throw new AuthException(AuthErrorCode.INVALID_TOKEN);
            }
        } catch (NumberFormatException exception) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
    }

    private void validateTimestamps(Jwt jwt) {
        Instant issuedAt = jwt.getIssuedAt();
        Instant expiresAt = jwt.getExpiresAt();
        Instant now = clock.instant();
        if (issuedAt == null || expiresAt == null) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        if (!expiresAt.isAfter(now) || !expiresAt.isAfter(issuedAt)) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
        if (issuedAt.isAfter(now.plusSeconds(CLOCK_SKEW_SECONDS))) {
            throw new AuthException(AuthErrorCode.INVALID_TOKEN);
        }
    }
}
