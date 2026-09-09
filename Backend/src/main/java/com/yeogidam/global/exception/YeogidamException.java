package com.yeogidam.global.exception;

/**
 * 여기담의 최상위 예외. 사유와 문구는 도메인별 ErrorCode enum 상수 하나가 전부 든다.
 */
public class YeogidamException extends RuntimeException {

    private final ErrorCode errorCode;

    public YeogidamException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
