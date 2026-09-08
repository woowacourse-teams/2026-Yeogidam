package com.yeogidam.media.exception;

import com.yeogidam.global.exception.DomainException;

public class UnselectablePlaceException extends DomainException {

    public UnselectablePlaceException(String message) {
        super(message);
    }

    @Override
    public String getErrorCode() {
        return "MEDIA400_004";
    }
}
