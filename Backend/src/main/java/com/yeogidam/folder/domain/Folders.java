package com.yeogidam.folder.domain;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import java.util.List;

/**
 * 한 회원이 가진 폴더 전부를 담은 일급 컬렉션으로, 폴더를 최대 10개까지 둔다는 규칙을 안다.
 */
public class Folders {

    private static final int MAX_COUNT = 10;

    private final List<Folder> folders;

    public Folders(List<Folder> folders) {
        validateNotNull(folders);
        this.folders = List.copyOf(folders);
    }

    private void validateNotNull(List<Folder> folders) {
        if (folders == null) {
            throw new IllegalArgumentException("폴더 목록이 없습니다.");
        }
    }

    public void validateAddable() {
        if (folders.size() >= MAX_COUNT) {
            throw new FolderException(FolderErrorCode.FOLDER_LIMIT_EXCEEDED);
        }
    }
}
