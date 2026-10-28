package com.yeogidam.folder.domain;

/**
 * 앞뒤 공백을 지운 폴더 이름으로, 지운 뒤 1자 이상 15자 이하여야 한다.
 */
public record FolderName(String value) {

    private static final int MAX_LENGTH = 15;

    public FolderName {
        validateNotBlank(value);
        value = value.strip();
        validateLength(value);
    }

    private void validateNotBlank(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("폴더 이름이 비어 있습니다.");
        }
    }

    private void validateLength(String value) {
        if (value.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("폴더 이름은 " + MAX_LENGTH + "자를 넘을 수 없습니다: " + value);
        }
    }
}
