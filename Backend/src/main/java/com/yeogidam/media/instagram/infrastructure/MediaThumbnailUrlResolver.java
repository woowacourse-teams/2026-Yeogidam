package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.instagram.config.ThumbnailProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** S3 객체 키를 현재 공개 배포 주소로 바꾼다. */
@Component
@RequiredArgsConstructor
public class MediaThumbnailUrlResolver {

    private final ThumbnailProperties thumbnailProperties;

    public String resolve(String thumbnailKey) {
        if (thumbnailKey == null || thumbnailKey.isBlank()) {
            return null;
        }
        if (thumbnailKey.startsWith("https://")) {
            return thumbnailKey;
        }
        String publicBaseUrl = thumbnailProperties.publicBaseUrl();
        if (publicBaseUrl == null || publicBaseUrl.isBlank()) {
            return null;
        }
        String baseUrl = publicBaseUrl.replaceAll("/+$", "");
        String key = thumbnailKey.replaceAll("^/+", "");
        return baseUrl + "/" + key;
    }
}
