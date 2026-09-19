package com.yeogidam.apppolicy.config;

import com.yeogidam.apppolicy.domain.Platform;
import com.yeogidam.apppolicy.domain.PlatformPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * application.yml의 app-update 아래를 통째로 받는 상자. 플랫폼마다 PlatformPolicy 하나씩이다.
 * 값이 비었거나 형식이 틀리면 기동에 실패하므로 요청 때는 검사하지 않는다. 바꿀 때는 재배포한다.
 */
@Validated
@ConfigurationProperties("app-update")
public record AppUpdatePolicyProperties(

        @NotNull
        @Valid
        PlatformPolicy ios,

        @NotNull
        @Valid
        PlatformPolicy android
) {
    public PlatformPolicy of(Platform platform) {
        if (platform == Platform.IOS) {
            return ios;
        }
        return android;
    }
}
