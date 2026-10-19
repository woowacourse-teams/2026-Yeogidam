package com.yeogidam.apppolicy.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 앱 업데이트 정책 설정을 빈으로 올린다. 서비스가 설정 빈 등록까지 맡지 않게 여기로 분리했다.
 */
@Configuration
@EnableConfigurationProperties(AppUpdatePolicyProperties.class)
public class AppUpdatePolicyConfig {
}
