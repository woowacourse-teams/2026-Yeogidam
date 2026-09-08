package com.yeogidam.media.domain;

/**
 * 미디어 소유자에 대한 집합체 간 참조. User 객체를 직접 들지 않고 식별자로 참조한다.
 */
public record OwnerId(
        Long value
) {

    public OwnerId {
        if (value == null) {
            throw new IllegalArgumentException("소유자가 비어 있습니다.");
        }
    }
}
