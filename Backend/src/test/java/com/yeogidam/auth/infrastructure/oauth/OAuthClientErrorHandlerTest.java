package com.yeogidam.auth.infrastructure.oauth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.member.domain.OAuthProvider;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.json.JsonMapper;

/**
 * 제공자 오류 응답을 우리 에러코드로 옮기는 규칙만 검증한다. 응답 본문은 스프링의 목 응답으로 만든다.
 */
class OAuthClientErrorHandlerTest {

    private final OAuthClientErrorHandler handler = new OAuthClientErrorHandler(JsonMapper.builder().build());

    @ParameterizedTest(name = "{0} {1} {2} -> {3}")
    @CsvSource(delimiter = '|', value = {
            "KAKAO  | 401 | {\"error\":\"invalid_grant\"}                          | INVALID_CREDENTIAL",
            "GOOGLE | 403 | {\"error\":\"access_denied\"}                          | INVALID_CREDENTIAL",
            "GOOGLE | 401 | {}                                                    | INVALID_CREDENTIAL",
            "KAKAO  | 400 | {\"error\":\"invalid_client\"}                         | PROVIDER_CONFIGURATION_ERROR",
            "GOOGLE | 400 | {\"error\":\"redirect_uri_mismatch\"}                  | PROVIDER_CONFIGURATION_ERROR",
            "KAKAO  | 400 | {\"error\":\"invalid_grant\",\"error_code\":\"KOE303\"}   | PROVIDER_CONFIGURATION_ERROR",
            "KAKAO  | 400 | {\"error\":\"invalid_request\",\"error_code\":\"KOE237\"} | PROVIDER_UNAVAILABLE",
            "APPLE  | 503 | {\"error\":\"server_error\"}                           | PROVIDER_UNAVAILABLE",
            "GOOGLE | 429 | {\"error\":\"slow_down\"}                              | PROVIDER_UNAVAILABLE",
            "KAKAO  | 400 | {\"error\":\"something-new\"}                          | INVALID_PROVIDER_RESPONSE",
            "KAKAO  | 400 | not-json                                              | INVALID_PROVIDER_RESPONSE"
    })
    void 제공자_응답의_상태와_오류_코드를_우리_에러코드로_옮긴다(
            OAuthProvider provider,
            int status,
            String body,
            AuthErrorCode expected
    ) {
        // given
        MockClientHttpResponse response = new MockClientHttpResponse(
                body.getBytes(StandardCharsets.UTF_8), HttpStatus.valueOf(status));

        // when & then
        assertThatThrownBy(() -> handler.handle(provider, response))
                .isInstanceOf(AuthException.class)
                .extracting("errorCode")
                .isEqualTo(expected);
    }

    @ParameterizedTest
    @CsvSource({
            "connection, PROVIDER_UNAVAILABLE",
            "other, INVALID_PROVIDER_RESPONSE"
    })
    void 통신_예외는_연결_실패와_나머지를_구분해_옮긴다(
            String kind,
            AuthErrorCode expected
    ) {
        // given
        RestClientException exception = new RestClientException("boom");
        if ("connection".equals(kind)) {
            exception = new ResourceAccessException("connect timed out");
        }

        // when
        AuthException translated = handler.handle(OAuthProvider.KAKAO, exception);

        // then
        assertThat(translated.getErrorCode()).isEqualTo(expected);
    }
}
