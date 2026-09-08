package com.yeogidam.media.exception;

import com.yeogidam.global.exception.DomainException;

public class InvalidExtractionTransitionException extends DomainException {

    public InvalidExtractionTransitionException(String message) {
        super(message);
    }

    @Override
    public String getErrorCode() {
        return "MEDIA400_003";
    }
}
