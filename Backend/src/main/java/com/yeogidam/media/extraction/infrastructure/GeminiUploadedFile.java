package com.yeogidam.media.extraction.infrastructure;

public record GeminiUploadedFile(
        String name,
        String uri,
        String mimeType
) {
}
