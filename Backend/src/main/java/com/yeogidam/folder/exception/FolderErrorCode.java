package com.yeogidam.folder.exception;

import com.yeogidam.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum FolderErrorCode implements ErrorCode {

    FOLDER_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "FOLDER400_001", "폴더는 최대 10개까지 만들 수 있습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    FolderErrorCode(
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
