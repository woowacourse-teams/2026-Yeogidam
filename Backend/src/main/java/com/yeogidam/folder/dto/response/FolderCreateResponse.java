package com.yeogidam.folder.dto.response;

import com.yeogidam.folder.domain.Folder;

/**
 * 폴더 만들기 응답으로, color에는 FolderColor 코드(RED 등)를 담고 실제 색 값은 앱이 정한다.
 */
public record FolderCreateResponse(
        Long folderId,
        String name,
        String color
) {
    public static FolderCreateResponse from(Folder folder) {
        return new FolderCreateResponse(
                folder.getId(),
                folder.getName().value(),
                folder.getColor().name()
        );
    }
}
