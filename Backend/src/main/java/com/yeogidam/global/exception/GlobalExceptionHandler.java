package com.yeogidam.global.exception;

import com.yeogidam.global.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
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

    /**
     * 필수 쿼리 파라미터가 아예 없을 때다. 값이 왔지만 뜻이 틀린 경우는 도메인이 자기 에러 코드로 알린다.
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingRequestParameter(MissingServletRequestParameterException exception) {
        return toResponse(CommonErrorCode.MISSING_REQUEST_PARAMETER);
    }

    /**
     * 경로 변수나 쿼리 파라미터의 타입이 맞지 않을 때다(예: 숫자 자리에 글자). 서버 장애가 아니라 요청이 틀린 것이라 400으로 알린다.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return toResponse(CommonErrorCode.REQUEST_VALUE_TYPE_MISMATCH);
    }

    /**
     * 도메인 객체가 값을 거부할 때다. 표준 예외라 응답에는 공통 문구만 담고, 어느 값이 왜 거부됐는지는 로그로 남긴다.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException exception) {
        ErrorCode errorCode = CommonErrorCode.ILLEGAL_ARGUMENT;
        log.warn("[요청 거부] {} {}", errorCode.getCode(), exception.getMessage(), exception);
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(errorCode.getMessage(), errorCode.getCode()));
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
        ErrorCode errorCode = CommonErrorCode.UNEXPECTED_EXCEPTION;
        log.error("[예기치 못한 오류] {} {}", request.getMethod(), request.getRequestURI(), exception);
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(errorCode.getMessage(), errorCode.getCode()));
    }

    private ResponseEntity<ErrorResponse> toResponse(ErrorCode errorCode) {
        logException(errorCode);
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(new ErrorResponse(errorCode.getMessage(), errorCode.getCode()));
    }
}
