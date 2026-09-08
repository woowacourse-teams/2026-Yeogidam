package com.yeogidam.media.exception;

import com.yeogidam.global.exception.DomainException;

public class RetryNotAllowedException extends DomainException {

    public RetryNotAllowedException(String message) {
        super(message);
    }

    @Override
    public String getErrorCode() {
        return "MEDIA400_002";
    }
}
