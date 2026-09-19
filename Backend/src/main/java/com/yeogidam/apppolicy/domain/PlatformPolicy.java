package com.yeogidam.apppolicy.domain;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * 플랫폼 하나의 업데이트 정책. 최소 지원 버전 아래는 강제, 최신 버전 아래는 권고다.
 * application.yml의 app-update.ios, app-update.android가 각각 이 모양으로 바인딩된다.
 */
public record PlatformPolicy(

        @NotNull
        AppVersion minimumSupportedVersion,

        @NotNull
        AppVersion latestVersion,

        @NotNull
        @Pattern(regexp = "^https://.+", message = "스토어 주소는 https여야 합니다.")
        String storeUrl
) {
    public PlatformPolicy {
        if (minimumSupportedVersion != null && latestVersion != null
                && latestVersion.isLowerThan(minimumSupportedVersion)) {
            throw new IllegalArgumentException(
                    "최신 버전(" + latestVersion.value() + ")이 최소 지원 버전(" + minimumSupportedVersion.value()
                            + ")보다 낮습니다.");
        }
    }

    public UpdateDecision decide(AppVersion appVersion) {
        boolean required = appVersion.isLowerThan(minimumSupportedVersion);
        boolean recommended = !required && appVersion.isLowerThan(latestVersion);
        return new UpdateDecision(required, recommended, this);
    }
}
