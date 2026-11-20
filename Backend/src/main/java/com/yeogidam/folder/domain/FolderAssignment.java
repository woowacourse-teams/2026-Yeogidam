package com.yeogidam.folder.domain;

import java.util.List;
import java.util.Set;

/**
 * 보관함 장소 하나가 지금 담긴 폴더 id 모음으로, 요청한 폴더와 비교해 새로 넣을 폴더와 뺄 폴더를 고른다. 어느 폴더에도 담기지 않은 장소는 빈 모음으로 다룬다.
 */
public class FolderAssignment {

    private final Set<Long> folderIds;

    public FolderAssignment(List<Long> folderIds) {
        validateNotNull(folderIds);
        this.folderIds = Set.copyOf(folderIds);
    }

    private void validateNotNull(List<Long> folderIds) {
        if (folderIds == null) {
            throw new IllegalArgumentException("담긴 폴더 목록은 null일 수 없습니다.");
        }
    }

    public List<Long> selectFolderIdsToAdd(Set<Long> requestedFolderIds) {
        return requestedFolderIds.stream()
                .filter(folderId -> !folderIds.contains(folderId))
                .toList();
    }

    public List<Long> selectFolderIdsToRemove(Set<Long> requestedFolderIds) {
        return folderIds.stream()
                .filter(folderId -> !requestedFolderIds.contains(folderId))
                .toList();
    }
}
