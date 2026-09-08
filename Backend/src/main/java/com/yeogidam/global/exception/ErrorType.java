package com.yeogidam.global.exception;

import org.springframework.http.HttpStatus;

public interface ErrorType {

    HttpStatus getHttpStatus();

    String getErrorCode();

    String getErrorMessage();
}
