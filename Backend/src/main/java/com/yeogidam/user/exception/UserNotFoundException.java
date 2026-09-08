package com.yeogidam.user.exception;

import com.yeogidam.global.exception.BusinessException;

public class UserNotFoundException extends BusinessException {

    public UserNotFoundException() {
        super(UserErrorType.NOT_FOUND);
    }
}
