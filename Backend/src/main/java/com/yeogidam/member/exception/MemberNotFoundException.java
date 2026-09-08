package com.yeogidam.member.exception;

import com.yeogidam.global.exception.BusinessException;

public class MemberNotFoundException extends BusinessException {

    public MemberNotFoundException() {
        super(MemberErrorType.NOT_FOUND);
    }
}
