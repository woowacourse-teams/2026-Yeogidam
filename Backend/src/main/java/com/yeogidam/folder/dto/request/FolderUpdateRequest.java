package com.yeogidam.folder.dto.request;

import jakarta.validation.constraints.NotNull;

public record FolderUpdateRequest(
        @NotNull
        String name,
        @NotNull
        String color
) {
}
