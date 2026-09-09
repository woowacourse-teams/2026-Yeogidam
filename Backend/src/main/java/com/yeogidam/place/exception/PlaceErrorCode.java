package com.yeogidam.place.exception;

import com.yeogidam.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum PlaceErrorCode implements ErrorCode {

    SAVED_PLACE_NOT_FOUND(HttpStatus.NOT_FOUND, "PLACE404_001", "저장된 장소가 아닙니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    PlaceErrorCode(
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
