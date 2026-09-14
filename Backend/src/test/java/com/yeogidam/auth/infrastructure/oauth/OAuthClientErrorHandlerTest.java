package com.yeogidam.auth.infrastructure.oauth;

import static org.assertj.core.api.Assertions.*;

import com.yeogidam.auth.config.oauth.GoogleProperties;
import com.yeogidam.auth.config.oauth.KakaoProperties;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.auth.infrastructure.oauth.google.GoogleClient;
import com.yeogidam.auth.infrastructure.oauth.kakao.KakaoClient;
import com.yeogidam.member.domain.OAuthProvider;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(OutputCaptureExtension.class)
class OAuthClientErrorHandlerTest {

    private final OAuthClientErrorHandler errorHandler = new OAuthClientErrorHandler(new JsonMapper());

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void 카카오_시크릿이_비어_있으면_외부_요청_전에_설정_예외가_발생한다(String clientSecret) {
        // given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder)
                .build();
        KakaoProperties properties = new KakaoProperties("client", clientSecret, "https://app.example/callback");
        KakaoClient client = new KakaoClient(builder.build(), properties, errorHandler);

        // when
        AuthException exception = org.junit.jupiter.api.Assertions.assertThrows(AuthException.class,
                () -> client.requestToken("authorization-code"));

        // then
        assertThat(exception.getErrorCode())
                .isEqualTo(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
        server.verify();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "\t\n"})
    void 구글_시크릿이_비어_있으면_외부_요청_전에_설정_예외가_발생한다(String clientSecret) {
        // given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder)
                .build();
        GoogleProperties properties = new GoogleProperties("client", clientSecret, "https://app.example/callback");
        GoogleClient client = new GoogleClient(builder.build(), properties, errorHandler);

        // when
        AuthException exception = org.junit.jupiter.api.Assertions.assertThrows(AuthException.class,
                () -> client.requestToken("authorization-code"));

        // then
        assertThat(exception.getErrorCode())
                .isEqualTo(AuthErrorCode.PROVIDER_NOT_CONFIGURED);
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "<html>Unavailable</html>", "{invalid-json", "null"})
    void 오류_본문을_읽을_수_없어도_제공자_장애로_예외가_발생한다(String body) {
        // given
        MockClientHttpResponse response = new MockClientHttpResponse(
                body.getBytes(StandardCharsets.UTF_8), HttpStatus.SERVICE_UNAVAILABLE);

        // when & then
        assertThatThrownBy(() -> errorHandler.handle(OAuthProvider.GOOGLE, response))
                .isInstanceOfSatisfying(AuthException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(AuthErrorCode.PROVIDER_UNAVAILABLE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{\"code\":-401,\"msg\":\"Invalid token\"}", "{\"error\":{\"code\":401}}"})
    void 사용자_정보_API의_오류_본문_형식이_달라도_인증_실패로_예외가_발생한다(String body) {
        // given
        MockClientHttpResponse response = new MockClientHttpResponse(
                body.getBytes(StandardCharsets.UTF_8), HttpStatus.UNAUTHORIZED);

        // when & then
        assertThatThrownBy(() -> errorHandler.handle(OAuthProvider.KAKAO, response))
                .isInstanceOfSatisfying(AuthException.class,
                        exception -> assertThat(exception.getErrorCode())
                                .isEqualTo(AuthErrorCode.INVALID_CREDENTIAL));
    }

    @ParameterizedTest
    @CsvSource({"invalid_grant,KOE320", "secret-authorization-code,secret-client-secret"})
    void 오류_로그에는_허용된_오류_코드만_남기고_제공자_설명은_남기지_않는다(
            String error, String detail, CapturedOutput output
    ) {
        // given
        String body = """
                {"error":"%s","error_code":"%s",
                "error_description":"secret-authorization-code secret-client-secret secret-access-token"}
                """.formatted(error, detail);
        MockClientHttpResponse response = new MockClientHttpResponse(
                body.getBytes(StandardCharsets.UTF_8), HttpStatus.BAD_REQUEST);

        // when
        AuthException exception = org.junit.jupiter.api.Assertions.assertThrows(AuthException.class,
                () -> errorHandler.handle(OAuthProvider.KAKAO, response));

        // then
        org.junit.jupiter.api.Assertions.assertAll(
                () -> assertThat(output.getAll())
                        .contains("provider=KAKAO", "status=400")
                        .doesNotContain("secret-authorization-code", "secret-client-secret", "secret-access-token"),
                () -> assertThat(exception.getMessage())
                        .doesNotContain("secret-authorization-code", "secret-client-secret", "secret-access-token")
        );
        if ("invalid_grant".equals(error)) {
            assertThat(output.getAll())
                    .contains("error=invalid_grant", "detail=KOE320");
        }
    }

    @Test
    void 연결_시간이_초과되면_원인을_보존한_제공자_장애_예외가_발생한다(CapturedOutput output) {
        // given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder)
                .build();
        GoogleProperties properties = new GoogleProperties("client", "secret", "https://app.example/callback");
        GoogleClient client = new GoogleClient(builder.build(), properties, errorHandler);
        SocketTimeoutException timeout = new SocketTimeoutException("secret-client-secret");
        server.expect(MockRestRequestMatchers.requestTo("https://oauth2.googleapis.com/token"))
                .andRespond(request -> {
                    throw timeout;
                });

        // when
        AuthException exception = org.junit.jupiter.api.Assertions.assertThrows(AuthException.class,
                () -> client.requestToken("authorization-code"));

        // then
        org.junit.jupiter.api.Assertions.assertAll(
                () -> assertThat(exception.getErrorCode())
                        .isEqualTo(AuthErrorCode.PROVIDER_UNAVAILABLE),
                () -> assertThat(exception.getCause())
                        .isInstanceOf(ResourceAccessException.class)
                        .hasCause(timeout),
                () -> assertThat(output.getAll())
                        .contains("provider=GOOGLE", "ResourceAccessException")
                        .doesNotContain("secret-client-secret")
        );
        server.verify();
    }
}
