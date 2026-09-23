package com.yeogidam.apppolicy.config;

import com.yeogidam.apppolicy.domain.Platform;
import com.yeogidam.apppolicy.domain.PlatformPolicy;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * application.yml의 app-update 아래를 통째로 받는 상자. 플랫폼마다 PlatformPolicy 하나씩이다.
 * 바인딩이 이 생성자를 거치므로 값이 비었거나 형식이 틀리면 기동에 실패한다. 그래서 요청 때는 검사하지 않고, 바꿀 때는 재배포한다.
 */
@ConfigurationProperties("app-update")
public record AppUpdatePolicyProperties(
        PlatformPolicy ios,
        PlatformPolicy android
) {

    public AppUpdatePolicyProperties {
        if (ios == null || android == null) {
            throw new IllegalArgumentException("플랫폼별 앱 업데이트 정책이 비어 있습니다.");
        }
    }

    public PlatformPolicy of(Platform platform) {
        if (platform == Platform.IOS) {
            return ios;
        }
        return android;
    }
}
