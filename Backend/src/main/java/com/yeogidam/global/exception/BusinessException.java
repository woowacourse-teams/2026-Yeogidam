package com.yeogidam.global.exception;

public abstract class BusinessException extends RuntimeException {

    private final ErrorType errorType;

    protected BusinessException(ErrorType errorType) {
        super(errorType.getErrorMessage());
        this.errorType = errorType;
    }

    protected BusinessException(
            ErrorType errorType,
            String message
    ) {
        super(message);
        this.errorType = errorType;
    }

    public ErrorType getErrorType() {
        return errorType;
    }
}
