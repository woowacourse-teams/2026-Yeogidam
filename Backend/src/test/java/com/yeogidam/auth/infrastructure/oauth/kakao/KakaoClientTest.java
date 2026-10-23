package com.yeogidam.auth.infrastructure.oauth.kakao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.yeogidam.auth.config.oauth.KakaoProperties;
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
 * 카카오 API는 HTTP 경계에서 끊고, 코드 교환 요청 조립과 사용자 정보 해석과 예외 변환을 검증한다.
 */
class KakaoClientTest {

    private static final String TOKEN_URI = "https://kauth.kakao.com/oauth/token";
    private static final String USER_INFO_URI = "https://kapi.kakao.com/v2/user/me";
    private static final String UNLINK_URI = "https://kapi.kakao.com/v1/user/unlink";
    private static final String TOKEN_BODY = "{\"access_token\":\"kakao-access\",\"refresh_token\":\"kakao-refresh\"}";
    private static final KakaoProperties PROPERTIES = new KakaoProperties(
            "rest-api-key", "client-secret", "https://app.example.com/oauth/kakao");

    private final RestClient.Builder restClientBuilder = RestClient.builder();
    private final MockRestServiceServer kakaoServer = MockRestServiceServer.bindTo(restClientBuilder).build();
    private final KakaoClient client = new KakaoClient(
            restClientBuilder.build(), PROPERTIES, new OAuthClientErrorHandler(JsonMapper.builder().build()));

    @Test
    void 인가_코드를_시크릿과_함께_교환하고_사용자_정보로_정체성을_만든다() {
        // given
        kakaoServer.expect(requestTo(TOKEN_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(content().formData(expectedTokenRequest("code-1")))
                .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        kakaoServer.expect(requestTo(USER_INFO_URI))
                .andExpect(header("Authorization", "Bearer kakao-access"))
                .andRespond(withSuccess("""
                        {"id":99,"kakao_account":{"email":"bean@kakao.com","is_email_valid":true,
                         "is_email_verified":true,"profile":{"nickname":"빈","profile_image_url":"https://img/1"}}}
                        """, MediaType.APPLICATION_JSON));

        // when
        OAuthIdentity identity = client.readIdentity("code-1");

        // then
        assertAll(
                () -> assertThat(client.getProvider()).isEqualTo(OAuthProvider.KAKAO),
                () -> assertThat(identity.getAccount()).isEqualTo(new OAuthAccount(OAuthProvider.KAKAO, "99")),
                () -> assertThat(identity.getProfile().nickname()).isEqualTo("빈"),
                () -> assertThat(identity.getProfile().email()).isEqualTo("bean@kakao.com"),
                () -> assertThat(identity.getProfile().imageUrl()).isEqualTo("https://img/1")
        );
        kakaoServer.verify();
    }

    @Test
    void 검증되지_않은_이메일과_동의하지_않은_프로필은_비워_둔다() {
        // given
        expectTokenExchange();
        kakaoServer.expect(requestTo(USER_INFO_URI))
                .andRespond(withSuccess(
                        "{\"id\":99,\"kakao_account\":{\"email\":\"x@kakao.com\",\"is_email_verified\":false}}",
                        MediaType.APPLICATION_JSON));

        // when
        OAuthIdentity identity = client.readIdentity("code-1");

        // then
        assertAll(
                () -> assertThat(identity.getProfile().email()).isNull(),
                () -> assertThat(identity.getProfile().nickname()).isNull()
        );
    }

    @Test
    void 탈퇴하면_새로_받은_액세스_토큰으로_카카오_연결을_해제한다() {
        // given
        expectTokenExchange();
        kakaoServer.expect(requestTo(USER_INFO_URI))
                .andExpect(header("Authorization", "Bearer kakao-access"))
                .andRespond(withSuccess("{\"id\":99}", MediaType.APPLICATION_JSON));
        kakaoServer.expect(requestTo(UNLINK_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer kakao-access"))
                .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andRespond(withSuccess());

        // when
        client.deleteAccount("code-1", new OAuthAccount(OAuthProvider.KAKAO, "99"));

        // then
        kakaoServer.verify();
    }

    @Test
    void 사용자_정보에_식별자가_없으면_자격증명_예외가_발생한다() {
        // given
        expectTokenExchange();
        kakaoServer.expect(requestTo(USER_INFO_URI))
                .andRespond(withSuccess("{\"kakao_account\":{}}", MediaType.APPLICATION_JSON));

        // when & then
        assertAuthError(AuthErrorCode.INVALID_CREDENTIAL);
    }

    @Test
    void 토큰_응답에_액세스_토큰이_없으면_제공자_응답_예외가_발생한다() {
        // given
        kakaoServer.expect(requestTo(TOKEN_URI))
                .andRespond(withSuccess("{\"refresh_token\":\"only\"}", MediaType.APPLICATION_JSON));

        // when & then
        assertAuthError(AuthErrorCode.INVALID_PROVIDER_RESPONSE);
    }

    @Test
    void 카카오가_인가_코드를_거부하면_자격증명_예외가_발생한다() {
        // given
        kakaoServer.expect(requestTo(TOKEN_URI))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"invalid_grant\",\"error_code\":\"KOE320\"}"));

        // when & then
        assertAuthError(AuthErrorCode.INVALID_CREDENTIAL);
    }

    @Test
    void 카카오_서버_오류는_제공자_장애_예외가_발생한다() {
        // given
        kakaoServer.expect(requestTo(TOKEN_URI)).andRespond(withServerError());

        // when & then
        assertAuthError(AuthErrorCode.PROVIDER_UNAVAILABLE);
    }

    private void expectTokenExchange() {
        kakaoServer.expect(requestTo(TOKEN_URI))
                .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
    }

    private static MultiValueMap<String, String> expectedTokenRequest(String code) {
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "authorization_code");
        body.add("client_id", "rest-api-key");
        body.add("client_secret", "client-secret");
        body.add("redirect_uri", "https://app.example.com/oauth/kakao");
        body.add("code", code);
        return body;
    }

    private void assertAuthError(AuthErrorCode expected) {
        assertThatThrownBy(() -> client.readIdentity("code-1"))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(expected);
    }
}
