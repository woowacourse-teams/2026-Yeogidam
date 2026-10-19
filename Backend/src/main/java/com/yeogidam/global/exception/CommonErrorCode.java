package com.yeogidam.global.exception;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@RequiredArgsConstructor
public enum CommonErrorCode implements ErrorCode {

    METHOD_ARGUMENT_NOT_VALID(HttpStatus.BAD_REQUEST, "COMMON400_001", "유효하지 않은 요청 필드입니다."),
    HTTP_MESSAGE_NOT_READABLE(HttpStatus.BAD_REQUEST, "COMMON400_002", "올바른 입력값 형식이 아닙니다."),
    MISSING_REQUEST_PARAMETER(HttpStatus.BAD_REQUEST, "COMMON400_003", "필수 요청 파라미터가 누락되었습니다."),
    REQUEST_VALUE_TYPE_MISMATCH(HttpStatus.BAD_REQUEST, "COMMON400_004", "요청 값의 형식이 올바르지 않습니다."),
    ILLEGAL_ARGUMENT(HttpStatus.BAD_REQUEST, "COMMON400_005", "요청 값이 올바르지 않습니다."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "COMMON404_001", "요청한 경로를 찾을 수 없습니다."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "COMMON405_001", "지원하지 않는 요청 메서드입니다."),
    UNEXPECTED_EXCEPTION(HttpStatus.INTERNAL_SERVER_ERROR, "COMMON500_001", "예기치 못한 예외가 발생했습니다.");

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
