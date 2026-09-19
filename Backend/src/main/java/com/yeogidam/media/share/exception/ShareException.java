package com.yeogidam.media.share.exception;

import com.yeogidam.global.exception.YeogidamException;

public class ShareException extends YeogidamException {

    public ShareException(ShareErrorCode errorCode) {
        super(errorCode);
    }
}
