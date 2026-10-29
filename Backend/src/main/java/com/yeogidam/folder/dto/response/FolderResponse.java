package com.yeogidam.folder.dto.response;

import com.yeogidam.folder.repository.FolderProjection;

/**
 * 폴더 목록의 폴더 한 개로, color에는 FolderColor 코드(RED 등)를 담고 실제 색 값은 앱이 정한다.
 */
public record FolderResponse(
        Long folderId,
        String name,
        String color
) {
    public static FolderResponse from(FolderProjection projection) {
        return new FolderResponse(
                projection.folderId(),
                projection.name(),
                projection.color()
        );
    }
}
