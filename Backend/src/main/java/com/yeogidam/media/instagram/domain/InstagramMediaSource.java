package com.yeogidam.media.instagram.domain;

import java.net.URI;

public record InstagramMediaSource(
        URI uri,
        String type
) {

    public boolean isVideo() {
        return "video".equals(type);
    }
}
