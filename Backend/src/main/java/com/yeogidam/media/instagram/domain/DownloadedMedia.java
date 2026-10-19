package com.yeogidam.media.instagram.domain;

import java.nio.file.Path;

public record DownloadedMedia(
        Path path,
        String mimeType
) {
}
