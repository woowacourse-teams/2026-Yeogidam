package com.yeogidam.auth.domain.token;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum TokenType {

    ACCESS("access"),
    REFRESH("refresh");

    private final String value;
}
