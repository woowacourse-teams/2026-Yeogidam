package com.yeogidam.global.exception;

import com.yeogidam.global.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException exception) {
        log.info("[요청 거부] {}", exception.getMessage());
        ErrorType errorType = exception.getErrorType();
        return ResponseEntity.status(errorType.getHttpStatus())
                .body(new ErrorResponse(exception.getMessage(), errorType.getErrorCode()));
    }

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<ErrorResponse> handleDomainException(DomainException exception) {
        log.info("[도메인 규칙 위반] {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse(exception.getMessage(), exception.getErrorCode()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(MethodArgumentNotValidException exception) {
        return toResponse(CommonErrorType.METHOD_ARGUMENT_NOT_VALID);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleHttpMessageNotReadable(HttpMessageNotReadableException exception) {
        return toResponse(CommonErrorType.HTTP_MESSAGE_NOT_READABLE);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error("[예기치 못한 오류] {} {}", request.getMethod(), request.getRequestURI(), exception);
        return toResponse(CommonErrorType.UNEXPECTED_EXCEPTION);
    }

    private ResponseEntity<ErrorResponse> toResponse(ErrorType errorType) {
        return ResponseEntity.status(errorType.getHttpStatus())
                .body(new ErrorResponse(errorType.getErrorMessage(), errorType.getErrorCode()));
    }
}
