package com.yeogidam.auth.infrastructure.oauth.apple;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AppleClientSecretGenerator {

    private static final String APPLE_AUDIENCE = "https://appleid.apple.com";
    private static final Duration CLIENT_SECRET_TTL = Duration.ofMinutes(5);

    private final AppleProperties properties;
    private final Clock clock;

    public String generate() {
        properties.validateConfiguration();
        try {
            JWTClaimsSet claims = createClaims();
            return createClientSecret(claims);
        } catch (GeneralSecurityException | JOSEException | IllegalArgumentException exception) {
            throw new AuthException(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
        }
    }

    private JWTClaimsSet createClaims() {
        Instant now = clock.instant();
        return new JWTClaimsSet.Builder()
                .issuer(properties.teamId())
                .subject(properties.clientId())
                .audience(APPLE_AUDIENCE)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(CLIENT_SECRET_TTL)))
                .build();
    }

    private String createClientSecret(JWTClaimsSet claims) throws GeneralSecurityException, JOSEException {
        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.ES256)
                .keyID(properties.keyId())
                .build();
        SignedJWT clientSecret = new SignedJWT(header, claims);
        clientSecret.sign(new ECDSASigner(readPrivateKey()));
        return clientSecret.serialize();
    }

    private ECPrivateKey readPrivateKey() throws GeneralSecurityException {
        String encodedKey = properties.privateKey()
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("\\n", "")
                .replaceAll("\\s", "");
        byte[] key = Base64.getDecoder()
                .decode(encodedKey);
        return (ECPrivateKey) KeyFactory.getInstance("EC")
                .generatePrivate(new PKCS8EncodedKeySpec(key));
    }
}
