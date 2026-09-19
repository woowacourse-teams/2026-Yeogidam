package com.yeogidam.media.share.exception;

import com.yeogidam.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@RequiredArgsConstructor
public enum ShareErrorCode implements ErrorCode {

    NOT_FOUND(HttpStatus.NOT_FOUND, "SHARE404_001", "존재하지 않는 공유입니다.");

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
