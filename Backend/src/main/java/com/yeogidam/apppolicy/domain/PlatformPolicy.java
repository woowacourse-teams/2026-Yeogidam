package com.yeogidam.apppolicy.domain;

/**
 * 플랫폼 하나의 업데이트 정책. 최소 지원 버전 아래는 강제, 최신 버전 아래는 권고다.
 * application.yml의 app-update.ios, app-update.android가 각각 이 모양으로 바인딩된다.
 * 바인딩도 이 생성자를 거치므로 설정이 비었거나 틀리면 기동에 실패한다.
 */
public record PlatformPolicy(
        AppVersion minimumSupportedVersion,
        AppVersion latestVersion,
        String storeUrl
) {

    private static final String HTTPS_PREFIX = "https://";

    public PlatformPolicy {
        if (minimumSupportedVersion == null || latestVersion == null) {
            throw new IllegalArgumentException("앱 업데이트 정책의 버전이 비어 있습니다.");
        }
        if (storeUrl == null || !storeUrl.startsWith(HTTPS_PREFIX)) {
            throw new IllegalArgumentException("스토어 주소는 https여야 합니다.");
        }
        if (latestVersion.isLowerThan(minimumSupportedVersion)) {
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
