package com.yeogidam.apppolicy.service;

import com.yeogidam.apppolicy.config.AppUpdatePolicyProperties;
import com.yeogidam.apppolicy.domain.AppVersion;
import com.yeogidam.apppolicy.domain.Platform;
import com.yeogidam.apppolicy.domain.PlatformPolicy;
import com.yeogidam.apppolicy.domain.UpdateDecision;
import com.yeogidam.apppolicy.dto.AppUpdatePolicyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@EnableConfigurationProperties(AppUpdatePolicyProperties.class)
public class AppUpdatePolicyService {

    private final AppUpdatePolicyProperties properties;

    /**
     * 쿼리 파라미터 문자열을 그대로 받아 도메인 값으로 바꾼다. 잘못된 값은 각 도메인 객체가 400 예외로 알린다.
     */
    public AppUpdatePolicyResponse readPolicy(String platform, String appVersion) {
        PlatformPolicy policy = properties.of(Platform.fromParameter(platform));
        AppVersion currentVersion = new AppVersion(appVersion);
        UpdateDecision decision = policy.decide(currentVersion);
        return AppUpdatePolicyResponse.from(decision);
    }
}
