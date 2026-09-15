package com.yeogidam.auth.infrastructure.oauth;

import com.yeogidam.auth.dto.response.OAuthErrorResponse;
import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.auth.exception.AuthException;
import com.yeogidam.member.domain.OAuthProvider;
import java.io.IOException;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class OAuthClientErrorHandler {

    private static final int MAX_ERROR_BODY_BYTES = 8192;
    private static final Set<String> CONFIGURATION_ERRORS = Set.of(
            "invalid_client", "unauthorized_client", "invalid_request", "unsupported_grant_type", "invalid_scope",
            "redirect_uri_mismatch", "misconfigured"
    );
    private static final Set<String> CREDENTIAL_ERRORS = Set.of("invalid_grant", "invalid_token", "access_denied");
    private static final Set<String> UNAVAILABLE_ERRORS = Set.of("server_error", "temporarily_unavailable", "slow_down");

    private final JsonMapper jsonMapper;

    public void handle(OAuthProvider provider, ClientHttpResponse response) throws IOException {
        int status = response.getStatusCode().value();
        OAuthErrorResponse error = readErrorResponse(response);
        AuthErrorCode errorCode = resolveErrorCode(provider, status, error);
        logProviderError(provider, status, error, errorCode);
        throw new AuthException(errorCode);
    }

    private OAuthErrorResponse readErrorResponse(ClientHttpResponse response) {
        try {
            byte[] body = response.getBody().readNBytes(MAX_ERROR_BODY_BYTES);
            OAuthErrorResponse error = jsonMapper.readValue(body, OAuthErrorResponse.class);
            if (error != null) {
                return error;
            }
        } catch (IOException | JacksonException exception) {
            // 본문이 비어 있거나 JSON 형식이 아니면 HTTP 상태로 판단한다.
        }
        return new OAuthErrorResponse(null, null, null);
    }

    private AuthErrorCode resolveErrorCode(OAuthProvider provider, int status, OAuthErrorResponse response) {
        if (status >= 500 || status == 429) {
            return AuthErrorCode.PROVIDER_UNAVAILABLE;
        }
        if (provider == OAuthProvider.KAKAO && "KOE237".equals(response.errorCode())) {
            return AuthErrorCode.PROVIDER_UNAVAILABLE;
        }
        if (provider == OAuthProvider.KAKAO
                && ("KOE303".equals(response.errorCode()) || "KOE310".equals(response.errorCode()))) {
            return AuthErrorCode.PROVIDER_CONFIGURATION_ERROR;
        }
        String error = readSafeError(response);
        if (UNAVAILABLE_ERRORS.contains(error)) {
            return AuthErrorCode.PROVIDER_UNAVAILABLE;
        }
        if (CONFIGURATION_ERRORS.contains(error)) {
            return AuthErrorCode.PROVIDER_CONFIGURATION_ERROR;
        }
        if (CREDENTIAL_ERRORS.contains(error) || status == 401 || status == 403) {
            return AuthErrorCode.INVALID_CREDENTIAL;
        }
        return AuthErrorCode.INVALID_PROVIDER_RESPONSE;
    }

    private void logProviderError(
            OAuthProvider provider, int status, OAuthErrorResponse response, AuthErrorCode errorCode
    ) {
        String error = readSafeError(response);
        String detail = readSafeDetail(response);
        if (errorCode.getHttpStatus()
                .is5xxServerError()) {
            log.error("[소셜 로그인 실패] provider={}, status={}, error={}, detail={}, code={}, mappedCode={}",
                    provider, status, error, detail, response.code(), errorCode.getCode());
            return;
        }
        log.warn("[소셜 로그인 거부] provider={}, status={}, error={}, detail={}, code={}, mappedCode={}",
                provider, status, error, detail, response.code(), errorCode.getCode());
    }

    private String readSafeError(OAuthErrorResponse response) {
        String error = response.error();
        if (error != null && (CONFIGURATION_ERRORS.contains(error) || CREDENTIAL_ERRORS.contains(error)
                || UNAVAILABLE_ERRORS.contains(error))) {
            return error;
        }
        return "unknown";
    }

    private String readSafeDetail(OAuthErrorResponse response) {
        String detail = response.errorCode();
        if (detail != null && detail.matches("KOE[0-9]{3}")) {
            return detail;
        }
        return "unknown";
    }

    public AuthException handle(OAuthProvider provider, RestClientException exception) {
        AuthErrorCode errorCode = AuthErrorCode.INVALID_PROVIDER_RESPONSE;
        if (exception instanceof ResourceAccessException) {
            errorCode = AuthErrorCode.PROVIDER_UNAVAILABLE;
        }
        log.error("[소셜 로그인 통신 실패] provider={}, exception={}, mappedCode={}",
                provider, exception.getClass()
                        .getSimpleName(), errorCode.getCode());
        return new AuthException(errorCode, exception);
    }
}
