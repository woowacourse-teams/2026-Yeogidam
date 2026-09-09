package com.yeogidam.global.exception;

import com.yeogidam.global.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(YeogidamException.class)
    public ResponseEntity<ErrorResponse> handleYeogidamException(YeogidamException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        log.info("[요청 거부] {} {}", errorCode.getCode(), exception.getMessage());
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(exception.getMessage(), errorCode.getCode()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(MethodArgumentNotValidException exception) {
        return toResponse(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleHttpMessageNotReadable(HttpMessageNotReadableException exception) {
        return toResponse(CommonErrorCode.HTTP_MESSAGE_NOT_READABLE);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error("[예기치 못한 오류] {} {}", request.getMethod(), request.getRequestURI(), exception);
        return toResponse(CommonErrorCode.UNEXPECTED_EXCEPTION);
    }

    private ResponseEntity<ErrorResponse> toResponse(ErrorCode errorCode) {
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(errorCode.getMessage(), errorCode.getCode()));
    }
}
