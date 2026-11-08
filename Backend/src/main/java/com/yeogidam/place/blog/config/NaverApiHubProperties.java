package com.yeogidam.place.blog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 키가 없거나 비어 있어도 앱은 뜨고 블로그 요청만 502가 되도록 값을 검증하지 않는다.
 * 블로그 탭 하나 때문에 배포 전체가 막히지 않게 하려는 것이다.
 */
@ConfigurationProperties("naver-api-hub")
public record NaverApiHubProperties(
        String keyId,
        String key
) {
}
