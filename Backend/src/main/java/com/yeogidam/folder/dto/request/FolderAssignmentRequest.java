package com.yeogidam.folder.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Set;

public record FolderAssignmentRequest(
        @NotNull
        @Size(max = 20)
        Set<@NotNull Long> folderIds
) {
}
