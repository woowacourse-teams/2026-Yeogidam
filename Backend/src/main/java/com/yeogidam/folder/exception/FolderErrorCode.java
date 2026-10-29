package com.yeogidam.folder.exception;

import com.yeogidam.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@RequiredArgsConstructor
public enum FolderErrorCode implements ErrorCode {

    FOLDER_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "FOLDER400_001", "폴더는 최대 10개까지 만들 수 있습니다."),
    INVALID_FOLDER_NAME(HttpStatus.BAD_REQUEST, "FOLDER400_002", "폴더 이름은 앞뒤 공백을 뺀 1자 이상 15자 이하여야 합니다."),
    INVALID_FOLDER_COLOR(HttpStatus.BAD_REQUEST, "FOLDER400_003", "color는 RED, ORANGE, YELLOW, GREEN, TEAL, PURPLE, PINK 중 하나여야 합니다."),
    FOLDER_NOT_FOUND(HttpStatus.NOT_FOUND, "FOLDER404_001", "폴더를 찾을 수 없습니다."),
    SAVED_PLACE_OR_FOLDER_NOT_FOUND(HttpStatus.NOT_FOUND, "FOLDER404_002", "보관함 장소나 폴더를 찾을 수 없습니다."),
    DUPLICATE_FOLDER_NAME(HttpStatus.CONFLICT, "FOLDER409_001", "같은 이름의 폴더가 이미 있습니다.");

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
