package com.yeogidam.media.exception;

import com.yeogidam.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

public enum MediaErrorCode implements ErrorCode {

    UNSUPPORTED_LINK(HttpStatus.BAD_REQUEST, "MEDIA400_001", "지원하지 않는 링크입니다."),
    RETRY_ON_SUCCEEDED(HttpStatus.BAD_REQUEST, "MEDIA400_002", "추출에 성공한 게시물은 다시 시도할 수 없습니다."),
    EXTRACTION_ALREADY_FINISHED(HttpStatus.BAD_REQUEST, "MEDIA400_003", "이미 추출이 끝난 게시물입니다."),
    NOT_A_CANDIDATE(HttpStatus.BAD_REQUEST, "MEDIA400_004", "이 공유 건의 후보가 아닌 장소는 결정할 수 없습니다."),
    RETRY_ALREADY_CLAIMED(HttpStatus.BAD_REQUEST, "MEDIA400_005", "이미 다시 시도가 접수된 게시물입니다."),
    RETRY_WHILE_EXTRACTING(HttpStatus.BAD_REQUEST, "MEDIA400_006", "추출이 진행 중인 게시물은 다시 시도할 수 없습니다."),
    EXTRACTION_NOT_FINISHED(HttpStatus.BAD_REQUEST, "MEDIA400_007", "추출이 끝나지 않은 게시물에는 선택할 장소가 없습니다."),
    FAILED_EXTRACTION_HAS_NO_PLACES(HttpStatus.BAD_REQUEST, "MEDIA400_008", "추출에 실패한 게시물에는 장소가 없습니다."),
    EMPTY_PLACE_SELECTION(HttpStatus.BAD_REQUEST, "MEDIA400_009", "결정할 장소를 한 개 이상 선택해야 합니다."),
    INVALID_LINK(HttpStatus.BAD_REQUEST, "MEDIA400_010", "올바른 인스타그램 링크 형식이 아닙니다."),
    MISSING_MEDIA_SHORTCODE(HttpStatus.BAD_REQUEST, "MEDIA400_011", "게시물 식별자가 비어 있습니다."),
    MISSING_EXTRACTION_STATE(HttpStatus.BAD_REQUEST, "MEDIA400_012", "추출 상태가 비어 있습니다."),
    INCOMPLETE_HISTORY_CURSOR(HttpStatus.BAD_REQUEST, "MEDIA400_015", "커서의 공유 시각과 ID는 함께 보내야 합니다."),

    SHARED_MEDIA_NOT_FOUND(HttpStatus.NOT_FOUND, "MEDIA404_002", "존재하지 않는 공유입니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    MediaErrorCode(
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
