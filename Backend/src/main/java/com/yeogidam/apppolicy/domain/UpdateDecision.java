package com.yeogidam.apppolicy.domain;

/**
 * 앱 버전 하나에 대한 판정 결과. 강제와 권고는 동시에 참이 되지 않는다.
 */
public record UpdateDecision(
        boolean required,
        boolean recommended,
        PlatformPolicy policy
) {
}
