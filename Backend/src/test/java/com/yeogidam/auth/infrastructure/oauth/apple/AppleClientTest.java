package com.yeogidam.auth.infrastructure.oauth.apple;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.nimbusds.jose.crypto.ECDSAVerifier;
import com.nimbusds.jwt.SignedJWT;
import com.yeogidam.auth.config.oauth.AppleProperties;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.OAuthClientErrorHandler;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import com.yeogidam.support.fixture.AppleKeyFixture;
import com.yeogidam.support.fixture.ProviderKeyFixture;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequest;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.RequestMatcher;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * 애플 토큰 엔드포인트와 JWKS는 HTTP 경계에서 끊고, ES256 client_secret을 실은 코드 교환과
 * identityToken 검증 결과를 정체성으로 옮기는 부분과 토큰 취소를 검증한다.
 */
class AppleClientTest {

    private static final String TOKEN_URI = "https://appleid.apple.com/auth/token";
    private static final String REVOKE_URI = "https://appleid.apple.com/auth/revoke";
    private static final String JWKS_URI = "https://appleid.apple.com/auth/keys";
    private static final String CLIENT_ID = "com.yeogidamm.app";
    private static final Instant NOW = Instant.parse("2026-09-15T00:00:00Z");

    private final AppleKeyFixture secretKey = new AppleKeyFixture();
    private final ProviderKeyFixture appleKey = new ProviderKeyFixture("apple-kid");
    private final AppleProperties properties = new AppleProperties(
            CLIENT_ID, "TEAM123", "KEY123", secretKey.privateKeyPem());
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final RestClient.Builder restClientBuilder = RestClient.builder();
    private final MockRestServiceServer appleServer = MockRestServiceServer.bindTo(restClientBuilder).build();
    private final RestTemplate jwksRestTemplate = new RestTemplate();
    private final MockRestServiceServer jwksServer = MockRestServiceServer.bindTo(jwksRestTemplate).build();
    private final AppleClient client = new AppleClient(
            restClientBuilder.build(),
            properties,
            new AppleIdentityTokenVerifier(properties, jwksRestTemplate, clock),
            new AppleClientSecretGenerator(properties, clock),
            new OAuthClientErrorHandler(JsonMapper.builder().build()));

    @Test
    void 인가_코드를_ES256_client_secret과_교환하고_id_token의_sub와_검증된_이메일로_정체성을_만든다() {
        // given
        String idToken = appleKey.sign(appleKey.appleClaims(CLIENT_ID, "001234.user", NOW)
                .claim("email", "bean@privaterelay.appleid.com")
                .claim("email_verified", "true")
                .build());
        appleServer.expect(requestTo(TOKEN_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(formFieldsAndSignedSecret("code-1"))
                .andRespond(withSuccess("{\"access_token\":\"a\",\"id_token\":\"" + idToken + "\"}",
                        MediaType.APPLICATION_JSON));
        jwksServer.expect(manyTimes(), requestTo(JWKS_URI))
                .andRespond(withSuccess(appleKey.jwksJson(), MediaType.APPLICATION_JSON));

        // when
        OAuthIdentity identity = client.readIdentity("code-1");

        // then
        assertAll(
                () -> assertThat(client.getProvider()).isEqualTo(OAuthProvider.APPLE),
                () -> assertThat(identity.getAccount())
                        .isEqualTo(new OAuthAccount(OAuthProvider.APPLE, "001234.user")),
                () -> assertThat(identity.getProfile().email()).isEqualTo("bean@privaterelay.appleid.com"),
                () -> assertThat(identity.getProfile().nickname()).isNull(),
                () -> assertThat(identity.getProfile().imageUrl()).isNull()
        );
        appleServer.verify();
    }

    @Test
    void 토큰_응답에_id_token이_없으면_제공자_응답_예외가_발생한다() {
        // given
        appleServer.expect(requestTo(TOKEN_URI))
                .andRespond(withSuccess("{\"access_token\":\"a\"}", MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.readIdentity("code-1"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
    }

    @Test
    void 애플이_이미_쓴_인가_코드를_거부하면_자격증명_예외가_발생한다() {
        // given
        appleServer.expect(requestTo(TOKEN_URI))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"invalid_grant\"}"));

        // when & then
        assertThatThrownBy(() -> client.readIdentity("code-1"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(AuthErrorCode.INVALID_CREDENTIAL);
    }

    @Test
    void 리프레시_토큰_취소는_token_type_hint를_싣고_빈_성공_응답을_받아들인다() {
        // given
        appleServer.expect(requestTo(REVOKE_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(formFields(Map.of("client_id", CLIENT_ID, "token", "apple-refresh",
                        "token_type_hint", "refresh_token")))
                .andRespond(withSuccess());

        // when & then
        assertThatCode(() -> client.revokeToken("apple-refresh")).doesNotThrowAnyException();
        appleServer.verify();
    }

    private RequestMatcher formFieldsAndSignedSecret(String code) {
        return request -> {
            Map<String, String> fields = formFields(request);
            assertAll(
                    () -> assertThat(fields).containsEntry("grant_type", "authorization_code"),
                    () -> assertThat(fields).containsEntry("client_id", CLIENT_ID),
                    () -> assertThat(fields).containsEntry("code", code),
                    () -> assertThat(SignedJWT.parse(fields.get("client_secret"))
                            .verify(new ECDSAVerifier(secretKey.publicKey()))).isTrue()
            );
        };
    }

    private static RequestMatcher formFields(Map<String, String> expected) {
        return request -> assertThat(formFields(request)).containsAllEntriesOf(expected);
    }

    private static Map<String, String> formFields(ClientHttpRequest request) {
        String body = ((MockClientHttpRequest) request).getBodyAsString();
        return Arrays.stream(body.split("&"))
                .map(pair -> pair.split("=", 2))
                .collect(Collectors.toMap(
                        pair -> URLDecoder.decode(pair[0], StandardCharsets.UTF_8),
                        pair -> URLDecoder.decode(pair[1], StandardCharsets.UTF_8)));
    }
}
