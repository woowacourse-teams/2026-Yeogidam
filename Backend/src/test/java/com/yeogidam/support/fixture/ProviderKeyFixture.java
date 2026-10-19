package com.yeogidam.support.fixture;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * 제공자 역할을 대신하는 ID 토큰 서명 키 한 벌. JWKS 응답 본문과 그 키로 서명한 ID 토큰을 만든다.
 */
public final class ProviderKeyFixture {

    private static final int KEY_SIZE = 2048;
    private static final Duration ID_TOKEN_TTL = Duration.ofMinutes(10);

    private final RSAKey signingKey;

    public ProviderKeyFixture(String keyId) {
        try {
            this.signingKey = new RSAKeyGenerator(KEY_SIZE)
                    .keyID(keyId)
                    .generate();
        } catch (JOSEException exception) {
            throw new IllegalStateException("RSA 키를 만들 수 없습니다.", exception);
        }
    }

    public String jwksJson() {
        return new JWKSet(signingKey.toPublicJWK()).toString();
    }

    /**
     * 애플 identityToken 모양의 클레임. 호출한 쪽이 필요한 클레임을 고쳐 쓴 뒤 sign한다.
     */
    public JWTClaimsSet.Builder appleClaims(
            String clientId,
            String subject,
            Instant now
    ) {
        return new JWTClaimsSet.Builder()
                .issuer("https://appleid.apple.com")
                .audience(clientId)
                .subject(subject)
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(ID_TOKEN_TTL)));
    }

    public String sign(JWTClaimsSet claims) {
        try {
            JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                    .keyID(signingKey.getKeyID())
                    .build();
            SignedJWT token = new SignedJWT(header, claims);
            token.sign(new RSASSASigner(signingKey));
            return token.serialize();
        } catch (JOSEException exception) {
            throw new IllegalStateException("ID 토큰에 서명할 수 없습니다.", exception);
        }
    }
}
