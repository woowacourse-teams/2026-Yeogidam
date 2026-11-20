package com.yeogidam.place.blog.exception;

import com.yeogidam.global.exception.YeogidamException;

public class PlaceBlogException extends YeogidamException {

    public PlaceBlogException(PlaceBlogErrorCode errorCode) {
        super(errorCode);
    }

    public PlaceBlogException(PlaceBlogErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
