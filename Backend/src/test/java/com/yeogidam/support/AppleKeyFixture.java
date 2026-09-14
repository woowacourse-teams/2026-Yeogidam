package com.yeogidam.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;

/**
 * 애플 개발자 계정에서 내려받는 .p8 개인키를 대신하는 P-256 키 한 벌. client_secret 서명과 그 검증에 쓴다.
 */
public final class AppleKeyFixture {

    private final ECKey key;

    public AppleKeyFixture() {
        try {
            this.key = new ECKeyGenerator(Curve.P_256).generate();
        } catch (JOSEException exception) {
            throw new IllegalStateException("EC 키를 만들 수 없습니다.", exception);
        }
    }

    /**
     * .p8 파일 내용과 같은 PKCS#8 PEM 문자열.
     */
    public String privateKeyPem() {
        try {
            String encoded = Base64.getEncoder().encodeToString(key.toECPrivateKey().getEncoded());
            return "-----BEGIN PRIVATE KEY-----\n" + encoded + "\n-----END PRIVATE KEY-----";
        } catch (JOSEException exception) {
            throw new IllegalStateException("EC 개인키를 내보낼 수 없습니다.", exception);
        }
    }

    public ECPublicKey publicKey() {
        try {
            return key.toECPublicKey();
        } catch (JOSEException exception) {
            throw new IllegalStateException("EC 공개키를 내보낼 수 없습니다.", exception);
        }
    }
}
