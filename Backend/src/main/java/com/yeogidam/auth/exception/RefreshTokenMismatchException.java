package com.yeogidam.auth.exception;

public class RefreshTokenMismatchException extends AuthException {

    public RefreshTokenMismatchException() {
        super(AuthErrorCode.REFRESH_TOKEN_REUSED);
    }
}
