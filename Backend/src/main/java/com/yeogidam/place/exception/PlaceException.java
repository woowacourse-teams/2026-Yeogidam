package com.yeogidam.place.exception;

import com.yeogidam.global.exception.YeogidamException;

public class PlaceException extends YeogidamException {

    public PlaceException(PlaceErrorCode errorCode) {
        super(errorCode);
    }
}
