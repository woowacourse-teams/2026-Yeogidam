package com.yeogidam;

import java.util.regex.Pattern;

public record MediaShortcode(String value) {

    private static final Pattern ALLOWED = Pattern.compile("^[A-Za-z0-9_-]+$");

    public MediaShortcode {
        validate(value);
    }

    private void validate(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("게시물 식별자가 비어 있습니다");
        }
        if (!ALLOWED.matcher(value).matches()) {
            throw new IllegalArgumentException("게시물 식별자 형식이 올바르지 않습니다: " + value);
        }
    }
}
