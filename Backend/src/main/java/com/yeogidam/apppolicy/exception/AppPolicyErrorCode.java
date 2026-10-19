package com.yeogidam.apppolicy.exception;

import com.yeogidam.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@RequiredArgsConstructor
public enum AppPolicyErrorCode implements ErrorCode {

    INVALID_PLATFORM(HttpStatus.BAD_REQUEST, "APP400_001", "platform은 ios 또는 android여야 합니다."),
    INVALID_APP_VERSION(HttpStatus.BAD_REQUEST, "APP400_002", "appVersion은 주.부.수정 형식이어야 합니다.");

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
