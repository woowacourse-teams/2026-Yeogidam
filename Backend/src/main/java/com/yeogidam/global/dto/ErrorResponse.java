package com.yeogidam.global.dto;

public record ErrorResponse(
        String message,
        String errorCode
) {
}
