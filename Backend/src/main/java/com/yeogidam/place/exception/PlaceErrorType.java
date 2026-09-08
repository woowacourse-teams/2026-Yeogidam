package com.yeogidam.place.exception;

import com.yeogidam.global.exception.ErrorType;
import org.springframework.http.HttpStatus;

public enum PlaceErrorType implements ErrorType {

    SAVED_PLACE_NOT_FOUND(HttpStatus.NOT_FOUND, "PLACE404_001", "저장된 장소가 아닙니다.");

    private final HttpStatus httpStatus;
    private final String errorCode;
    private final String errorMessage;

    PlaceErrorType(
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
