package com.yeogidam.media.exception;

import com.yeogidam.global.exception.BusinessException;

/**
 * InstagramUrl 값 객체가 던진 사유별 메시지를 그대로 실어 나른다.
 * 메시지에 입력값이 들어 있어 로깅 계층 없이도 미지원 형태를 관측할 수 있다(ADR-01 결정 1).
 */
public class UnsupportedInstagramLinkException extends BusinessException {

    public UnsupportedInstagramLinkException(String message) {
        super(InstagramMediaErrorType.UNSUPPORTED_LINK, message);
    }
}
