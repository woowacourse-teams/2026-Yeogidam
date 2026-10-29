package com.yeogidam.folder.repository;

/**
 * 폴더 목록용 조회 상자로, folders 한 행의 식별자, 이름, 색 코드를 담는다.
 */
public record FolderProjection(
        Long folderId,
        String name,
        String color
) {
}
