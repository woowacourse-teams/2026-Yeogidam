package com.yeogidam.auth.exception;

import com.yeogidam.global.exception.YeogidamException;

public class AuthException extends YeogidamException {

    public AuthException(AuthErrorCode errorCode) {
        super(errorCode);
    }

    public AuthException(AuthErrorCode errorCode, Throwable cause) {
        super(errorCode, cause);
    }
}
