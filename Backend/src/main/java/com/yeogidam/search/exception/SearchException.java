package com.yeogidam.search.exception;

import com.yeogidam.global.exception.YeogidamException;

public class SearchException extends YeogidamException {

    public SearchException(SearchErrorCode errorCode) {
        super(errorCode);
    }
}
