package com.yeogidam.apppolicy.exception;

import com.yeogidam.global.exception.YeogidamException;

public class AppPolicyException extends YeogidamException {

    public AppPolicyException(AppPolicyErrorCode errorCode) {
        super(errorCode);
    }
}
