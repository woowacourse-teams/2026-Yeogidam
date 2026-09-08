package com.yeogidam.media.exception;

import com.yeogidam.global.exception.ErrorType;
import org.springframework.http.HttpStatus;

public enum InstagramMediaErrorType implements ErrorType {

    UNSUPPORTED_LINK(HttpStatus.BAD_REQUEST, "MEDIA400_001", "지원하지 않는 링크입니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "MEDIA404_001", "존재하지 않는 릴스입니다.");

    private final HttpStatus httpStatus;
    private final String errorCode;
    private final String errorMessage;

    InstagramMediaErrorType(
            HttpStatus httpStatus,
            String errorCode,
            String errorMessage
    ) {
        this.httpStatus = httpStatus;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }

    @Override
    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    @Override
    public String getErrorCode() {
        return errorCode;
    }

    @Override
    public String getErrorMessage() {
        return errorMessage;
    }
}
