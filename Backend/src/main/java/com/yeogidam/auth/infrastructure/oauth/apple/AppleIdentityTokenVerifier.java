package com.yeogidam.auth.infrastructure.oauth.apple;

import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import java.time.Clock;
import java.time.Instant;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestOperations;

@Component
public class AppleIdentityTokenVerifier {

    private static final String JWK_SET_URI = "https://appleid.apple.com/auth/keys";
    private static final String ISSUER = "https://appleid.apple.com";
    private static final long CLOCK_SKEW_SECONDS = 60;

    private final NimbusJwtDecoder decoder;
    private final AppleProperties properties;
    private final Clock clock;

    public AppleIdentityTokenVerifier(
            AppleProperties properties,
            RestOperations oauthJwkRestOperations,
            Clock clock
    ) {
        this.properties = properties;
        this.clock = clock;
        this.decoder = NimbusJwtDecoder.withJwkSetUri(JWK_SET_URI)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .restOperations(oauthJwkRestOperations)
                .build();
        this.decoder.setJwtValidator(this::validateClaims);
    }

    public Jwt verify(String identityToken) {
        if (identityToken == null || identityToken.isBlank()) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        }
        try {
            return decoder.decode(identityToken);
        } catch (BadJwtException | IllegalArgumentException exception) {
            throw new AuthException(AuthErrorCode.INVALID_CREDENTIAL);
        } catch (JwtException exception) {
            throw new AuthException(AuthErrorCode.PROVIDER_UNAVAILABLE);
        }
    }

    private OAuth2TokenValidatorResult validateClaims(Jwt jwt) {
        if (!hasValidIssuerAndAudience(jwt) || !hasValidTimestamps(jwt)
                || jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        }
        return OAuth2TokenValidatorResult.success();
    }

    private boolean hasValidIssuerAndAudience(Jwt jwt) {
        String authorizedParty = jwt.getClaimAsString("azp");
        if (authorizedParty != null && !properties.clientId()
                .equals(authorizedParty)) {
            return false;
        }
        return ISSUER.equals(jwt.getClaimAsString("iss"))
                && jwt.getAudience() != null
                && jwt.getAudience()
                .contains(properties.clientId())
                && (jwt.getAudience().size() == 1 || authorizedParty != null);
    }

    private boolean hasValidTimestamps(Jwt jwt) {
        Instant now = clock.instant();
        return jwt.getExpiresAt() != null && jwt.getExpiresAt()
                .isAfter(now)
                && jwt.getIssuedAt() != null && !jwt.getIssuedAt()
                .isAfter(now.plusSeconds(CLOCK_SKEW_SECONDS))
                && (jwt.getNotBefore() == null || !jwt.getNotBefore()
                .isAfter(now.plusSeconds(CLOCK_SKEW_SECONDS)));
    }
}
