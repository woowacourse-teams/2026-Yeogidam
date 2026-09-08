package com.yeogidam.media.exception;

import com.yeogidam.global.exception.BusinessException;

public class InstagramMediaNotFoundException extends BusinessException {

    public InstagramMediaNotFoundException() {
        super(InstagramMediaErrorType.NOT_FOUND);
    }
}
