package com.yeogidam.apppolicy.domain;

import com.yeogidam.apppolicy.exception.AppPolicyErrorCode;
import com.yeogidam.apppolicy.exception.AppPolicyException;
import java.util.regex.Pattern;

/**
 * 앱 스토어에 올라간 앱의 버전(주.부.수정). 여기담 도메인이 아니라 앱 배포와 운영의 개념이다. 두 자리(1.2)는 수정 0으로 본다. 앞자리 0, 접두사, 접미사는 받지 않는다. 문자열로 비교하면
 * 1.10.0이 1.9.0보다 낮게 보이므로 자리별 정수로 비교한다.
 * 문자열 생성자가 있어 application.yml의 "1.2.0"이 별도 Converter 없이 바인딩된다.
 */
public record AppVersion(
        int major,
        int minor,
        int patch
) implements Comparable<AppVersion> {

    private static final Pattern FORMAT = Pattern.compile("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:\\.(0|[1-9]\\d*))?$");
    private static final int MAX_LENGTH = 32;

    public AppVersion(String value) {
        this(parts(value)[0], parts(value)[1], parts(value)[2]);
    }

    public String value() {
        return major + "." + minor + "." + patch;
    }

    private static int[] parts(String value) {
        if (value == null || value.length() > MAX_LENGTH || !FORMAT.matcher(value).matches()) {
            throw new AppPolicyException(AppPolicyErrorCode.INVALID_APP_VERSION);
        }
        String[] tokens = value.split("\\.");
        return new int[]{Integer.parseInt(tokens[0]), Integer.parseInt(tokens[1]), patchOf(tokens)};
    }

    private static int patchOf(String[] tokens) {
        if (tokens.length < 3) {
            return 0;
        }
        return Integer.parseInt(tokens[2]);
    }

    public boolean isLowerThan(AppVersion other) {
        return compareTo(other) < 0;
    }

    @Override
    public int compareTo(AppVersion other) {
        if (major != other.major) {
            return Integer.compare(major, other.major);
        }
        if (minor != other.minor) {
            return Integer.compare(minor, other.minor);
        }
        return Integer.compare(patch, other.patch);
    }
}
