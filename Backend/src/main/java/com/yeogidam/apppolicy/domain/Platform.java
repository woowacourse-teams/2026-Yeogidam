package com.yeogidam.apppolicy.domain;

import com.yeogidam.apppolicy.exception.AppPolicyErrorCode;
import com.yeogidam.apppolicy.exception.AppPolicyException;
import java.util.Arrays;

public enum Platform {

    IOS,
    ANDROID;

    /**
     * 쿼리 파라미터 값(ios, android)을 받는다. 대소문자는 구분하지 않는다.
     */
    public static Platform fromParameter(String value) {
        return Arrays.stream(values())
                .filter(platform -> platform.name().equalsIgnoreCase(value))
                .findFirst()
                .orElseThrow(() -> new AppPolicyException(AppPolicyErrorCode.INVALID_PLATFORM));
    }
}
