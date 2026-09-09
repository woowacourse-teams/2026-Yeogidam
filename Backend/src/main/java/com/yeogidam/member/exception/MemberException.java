package com.yeogidam.member.exception;

import com.yeogidam.global.exception.YeogidamException;

public class MemberException extends YeogidamException {

    public MemberException(MemberErrorCode errorCode) {
        super(errorCode);
    }
}
