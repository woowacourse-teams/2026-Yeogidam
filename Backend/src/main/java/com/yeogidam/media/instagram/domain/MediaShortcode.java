package com.yeogidam.media.instagram.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import java.util.regex.Pattern;

public record MediaShortcode(String value) {

    private static final Pattern ALLOWED = Pattern.compile("^[A-Za-z0-9_-]+$");

    public MediaShortcode {
        validate(value);
    }

    private void validate(String value) {
        if (value == null || value.isBlank()) {
            throw new MediaException(MediaErrorCode.MISSING_MEDIA_SHORTCODE);
        }
        if (!ALLOWED.matcher(value).matches()) {
            throw new MediaException(MediaErrorCode.INVALID_LINK);
        }
    }
}
