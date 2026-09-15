package com.yeogidam.auth.exception;

import com.yeogidam.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@RequiredArgsConstructor
public enum AuthErrorCode implements ErrorCode {

    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "AUTH401_001", "인증 토큰이 유효하지 않습니다."),
    INVALID_CREDENTIAL(HttpStatus.UNAUTHORIZED, "AUTH401_002", "소셜 로그인 인증 정보가 유효하지 않습니다."),
    REFRESH_TOKEN_REUSED(HttpStatus.UNAUTHORIZED, "AUTH401_003", "이미 사용된 리프레시 토큰입니다. 다시 로그인해 주세요."),

    PROVIDER_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "AUTH502_001", "소셜 로그인 제공자에 연결할 수 없습니다."),
    INVALID_PROVIDER_RESPONSE(HttpStatus.BAD_GATEWAY, "AUTH502_002", "소셜 로그인 제공자의 응답 정보가 유효하지 않습니다."),

    PROVIDER_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "AUTH503_001", "소셜 로그인 설정이 준비되지 않았습니다."),
    PROVIDER_CONFIGURATION_ERROR(HttpStatus.SERVICE_UNAVAILABLE, "AUTH503_002", "소셜 로그인 연동 설정이 올바르지 않습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    @Override
    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    @Override
    public String getCode() {
        return code;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
