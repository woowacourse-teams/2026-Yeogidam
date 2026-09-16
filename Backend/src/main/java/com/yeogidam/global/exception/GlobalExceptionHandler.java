package com.yeogidam.global.exception;

import com.yeogidam.global.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(YeogidamException.class)
    public ResponseEntity<ErrorResponse> handleYeogidamException(YeogidamException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        logException(errorCode);
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(exception.getMessage(), errorCode.getCode()));
    }

    private void logException(ErrorCode errorCode) {
        if (errorCode.getHttpStatus().is5xxServerError()) {
            log.error("[요청 실패] {}", errorCode.getCode());
            return;
        }
        if (errorCode.getHttpStatus() == HttpStatus.UNAUTHORIZED || errorCode.getHttpStatus() == HttpStatus.FORBIDDEN) {
            log.warn("[인증 거부] {}", errorCode.getCode());
            return;
        }
        log.info("[요청 거부] {}", errorCode.getCode());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(MethodArgumentNotValidException exception) {
        return toResponse(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleHttpMessageNotReadable(HttpMessageNotReadableException exception) {
        return toResponse(CommonErrorCode.HTTP_MESSAGE_NOT_READABLE);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResourceFound(NoResourceFoundException exception) {
        return toResponse(CommonErrorCode.RESOURCE_NOT_FOUND);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotSupported(HttpRequestMethodNotSupportedException exception) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .headers(exception.getHeaders())
                .body(new ErrorResponse(CommonErrorCode.METHOD_NOT_ALLOWED.getMessage(),
                        CommonErrorCode.METHOD_NOT_ALLOWED.getCode()));
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
