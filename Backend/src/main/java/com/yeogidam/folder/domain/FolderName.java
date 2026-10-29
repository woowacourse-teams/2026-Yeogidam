package com.yeogidam.folder.domain;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;

/**
 * 앞뒤 공백을 지운 폴더 이름으로, 줄바꿈이나 탭 같은 제어 문자는 넣을 수 없고 지운 뒤 1자 이상 15자 이하여야 한다.
 */
public record FolderName(String value) {

    private static final int MAX_LENGTH = 15;

    public FolderName {
        validateNotBlank(value);
        validateWithoutControlCharacter(value);
        value = value.strip();
        validateLength(value);
    }

    private void validateNotBlank(String value) {
        if (value == null || value.isBlank()) {
            throw new FolderException(FolderErrorCode.INVALID_FOLDER_NAME);
        }
    }

    private void validateWithoutControlCharacter(String value) {
        if (value.chars().anyMatch(Character::isISOControl)) {
            throw new FolderException(FolderErrorCode.INVALID_FOLDER_NAME);
        }
    }

    private void validateLength(String value) {
        if (value.length() > MAX_LENGTH) {
            throw new FolderException(FolderErrorCode.INVALID_FOLDER_NAME);
        }
    }
}
