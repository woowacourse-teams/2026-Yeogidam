package com.yeogidam.folder.dto.response;

import com.yeogidam.folder.repository.FolderProjection;
import java.util.List;

public record FolderResponses(
        List<FolderResponse> folders
) {
    public static FolderResponses from(List<FolderProjection> projections) {
        List<FolderResponse> folders = projections.stream()
                .map(FolderResponse::from)
                .toList();
        return new FolderResponses(folders);
    }
}
