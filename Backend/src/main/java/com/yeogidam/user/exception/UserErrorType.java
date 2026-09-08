package com.yeogidam.user.exception;

import com.yeogidam.global.exception.ErrorType;
import org.springframework.http.HttpStatus;

public enum UserErrorType implements ErrorType {

    NOT_FOUND(HttpStatus.NOT_FOUND, "USER404_001", "존재하지 않는 사용자입니다.");

    private final HttpStatus httpStatus;
    private final String errorCode;
    private final String errorMessage;

    UserErrorType(
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
