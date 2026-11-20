package com.yeogidam.search.exception;

import com.yeogidam.global.exception.ErrorCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum SearchErrorCode implements ErrorCode {

    INVALID_SEARCH_QUERY(HttpStatus.BAD_REQUEST, "SEARCH400_001", "검색어는 앞뒤 공백을 제외하고 1자 이상 100자 이하여야 합니다.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;
}
