package com.yeogidam.auth.infrastructure.oauth.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.yeogidam.auth.config.oauth.GoogleProperties;
import com.yeogidam.auth.domain.oauth.OAuthIdentity;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.OAuthClientErrorHandler;
import com.yeogidam.member.domain.OAuthAccount;
import com.yeogidam.member.domain.OAuthProvider;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/**
 * 구글 API는 HTTP 경계에서 끊고, 코드 교환 요청 조립과 userinfo 해석과 예외 변환을 검증한다.
 */
class GoogleClientTest {

    private static final String TOKEN_URI = "https://oauth2.googleapis.com/token";
    private static final String USER_INFO_URI = "https://openidconnect.googleapis.com/v1/userinfo";
    private static final String REVOKE_URI = "https://oauth2.googleapis.com/revoke";
    private static final String TOKEN_BODY = "{\"access_token\":\"google-access\",\"id_token\":\"id\"}";
    private static final GoogleProperties PROPERTIES = new GoogleProperties(
            "google-client", "google-secret", "https://app.example.com/oauth/google");

    private final RestClient.Builder restClientBuilder = RestClient.builder();
    private final MockRestServiceServer googleServer = MockRestServiceServer.bindTo(restClientBuilder).build();
    private final GoogleClient client = new GoogleClient(
            restClientBuilder.build(), PROPERTIES, new OAuthClientErrorHandler(JsonMapper.builder().build()));

    @Test
    void 인가_코드를_시크릿과_함께_교환하고_userinfo로_정체성을_만든다() {
        // given
        googleServer.expect(requestTo(TOKEN_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().formData(expectedTokenRequest("code-1")))
                .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        googleServer.expect(requestTo(USER_INFO_URI))
                .andExpect(header("Authorization", "Bearer google-access"))
                .andRespond(withSuccess("""
                        {"sub":"google-user","name":"빈","email":"bean@gmail.com","email_verified":true,
                         "picture":"https://img/1"}
                        """, MediaType.APPLICATION_JSON));

        // when
        OAuthIdentity identity = client.readIdentity("code-1");

        // then
        assertAll(
                () -> assertThat(client.getProvider()).isEqualTo(OAuthProvider.GOOGLE),
                () -> assertThat(identity.getAccount())
                        .isEqualTo(new OAuthAccount(OAuthProvider.GOOGLE, "google-user")),
                () -> assertThat(identity.getProfile().nickname()).isEqualTo("빈"),
                () -> assertThat(identity.getProfile().email()).isEqualTo("bean@gmail.com"),
                () -> assertThat(identity.getProfile().imageUrl()).isEqualTo("https://img/1")
        );
        googleServer.verify();
    }

    @Test
    void 검증되지_않은_이메일은_비워_둔다() {
        // given
        googleServer.expect(requestTo(TOKEN_URI)).andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        googleServer.expect(requestTo(USER_INFO_URI))
                .andRespond(withSuccess("{\"sub\":\"google-user\",\"email\":\"x@gmail.com\",\"email_verified\":false}",
                        MediaType.APPLICATION_JSON));

        // when
        OAuthIdentity identity = client.readIdentity("code-1");

        // then
        assertThat(identity.getProfile().email()).isNull();
    }

    @Test
    void 탈퇴하면_새로_받은_리프레시_토큰을_폐기한다() {
        // given
        googleServer.expect(requestTo(TOKEN_URI))
                .andRespond(withSuccess("""
                        {"access_token":"google-access","refresh_token":"google-refresh"}
                        """, MediaType.APPLICATION_JSON));
        googleServer.expect(requestTo(USER_INFO_URI))
                .andExpect(header("Authorization", "Bearer google-access"))
                .andRespond(withSuccess("{\"sub\":\"google-user\"}", MediaType.APPLICATION_JSON));
        googleServer.expect(requestTo(REVOKE_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(content().formData(expectedRevokeRequest("google-refresh")))
                .andRespond(withSuccess());

        // when
        client.deleteAccount("code-1", new OAuthAccount(OAuthProvider.GOOGLE, "google-user"));

        // then
        googleServer.verify();
    }

    @Test
    void userinfo에_sub가_없으면_자격증명_예외가_발생한다() {
        // given
        googleServer.expect(requestTo(TOKEN_URI)).andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        googleServer.expect(requestTo(USER_INFO_URI))
                .andRespond(withSuccess("{\"name\":\"빈\"}", MediaType.APPLICATION_JSON));

        // when & then
        assertAuthError(AuthErrorCode.INVALID_CREDENTIAL);
    }

    @Test
    void 구글이_다른_앱의_인가_코드를_거부하면_설정_오류_예외가_발생한다() {
        // given
        googleServer.expect(requestTo(TOKEN_URI))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"invalid_client\"}"));

        // when & then
        assertAuthError(AuthErrorCode.PROVIDER_CONFIGURATION_ERROR);
    }

    private static MultiValueMap<String, String> expectedTokenRequest(String code) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "authorization_code");
        body.add("client_id", "google-client");
        body.add("client_secret", "google-secret");
        body.add("redirect_uri", "https://app.example.com/oauth/google");
        body.add("code", code);
        return body;
    }

    private static MultiValueMap<String, String> expectedRevokeRequest(String token) {
        LinkedMultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("token", token);
        return body;
    }

    private void assertAuthError(AuthErrorCode expected) {
        assertThatThrownBy(() -> client.readIdentity("code-1"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(expected);
    }
}
