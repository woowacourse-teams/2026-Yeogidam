package com.yeogidam.member.exception;

import com.yeogidam.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum MemberErrorCode implements ErrorCode {

    NOT_FOUND(HttpStatus.NOT_FOUND, "USER404_001", "존재하지 않는 사용자입니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    MemberErrorCode(
            HttpStatus httpStatus,
            String code,
            String message
    ) {
        this.httpStatus = httpStatus;
        this.code = code;
        this.message = message;
    }

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
