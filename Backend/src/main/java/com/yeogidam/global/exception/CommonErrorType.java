package com.yeogidam.global.exception;

import org.springframework.http.HttpStatus;

public enum CommonErrorType implements ErrorType {

    METHOD_ARGUMENT_NOT_VALID(HttpStatus.BAD_REQUEST, "COMMON400_001", "유효하지 않은 요청 필드입니다."),
    HTTP_MESSAGE_NOT_READABLE(HttpStatus.BAD_REQUEST, "COMMON400_002", "올바른 입력값 형식이 아닙니다."),
    UNEXPECTED_EXCEPTION(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON500_001", "예기치 못한 예외가 발생했습니다.");

    private final HttpStatus httpStatus;
    private final String errorCode;
    private final String errorMessage;

    CommonErrorType(
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
