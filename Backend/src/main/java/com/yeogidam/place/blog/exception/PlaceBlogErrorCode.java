package com.yeogidam.place.blog.exception;

import com.yeogidam.global.exception.ErrorCode;
import org.springframework.http.HttpStatus;

/**
 * 장소 상세 블로그 탭의 오류 코드로, 블로그 기능을 들어낼 때 패키지와 함께 지우도록 PlaceErrorCode와 나눴다.
 * 코드는 PLACE 순번을 이어 쓰므로, PlaceErrorCode에 502 코드를 더할 때는 PLACE502_001과 겹치지 않게 한다.
 */
public enum PlaceBlogErrorCode implements ErrorCode {

    BLOG_SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "PLACE502_001", "블로그 검색 결과를 가져오지 못했습니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    PlaceBlogErrorCode(
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
