package com.yeogidam.media.exception;

import com.yeogidam.global.exception.YeogidamException;

/**
 * media 도메인의 예외는 이 클래스 하나이고, 사유와 문구는 MediaErrorCode 상수로 가른다.
 */
public class MediaException extends YeogidamException {

    public MediaException(MediaErrorCode errorCode) {
        super(errorCode);
    }

}
