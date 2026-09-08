package com.yeogidam.global.exception;

/**
 * 도메인 객체가 던지는 예외의 최상위 타입.
 * 도메인은 스프링과 HTTP를 몰라야 하므로 상태 코드 없이 사유 코드만 가진다.
 * HTTP 400으로의 변환은 GlobalExceptionHandler가 맡는다.
 */
public abstract class DomainException extends RuntimeException {

    protected DomainException(String message) {
        super(message);
    }

    public abstract String getErrorCode();
}
