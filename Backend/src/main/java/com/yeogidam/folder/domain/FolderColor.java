package com.yeogidam.folder.domain;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import java.util.Arrays;

/**
 * 폴더 색 코드로, 실제 색 값은 앱이 코드마다 정해 그린다.
 */
public enum FolderColor {

    RED,
    ORANGE,
    YELLOW,
    GREEN,
    TEAL,
    PURPLE,
    PINK;

    /**
     * 요청 본문의 색 코드(RED 등)를 받으며, 대소문자를 구분한다.
     */
    public static FolderColor from(String value) {
        return Arrays.stream(values())
                .filter(color -> color.name().equals(value))
                .findFirst()
                .orElseThrow(() -> new FolderException(FolderErrorCode.INVALID_FOLDER_COLOR));
    }
}
