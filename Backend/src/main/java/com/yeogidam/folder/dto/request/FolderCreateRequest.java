package com.yeogidam.folder.dto.request;

import jakarta.validation.constraints.NotNull;

public record FolderCreateRequest(
        @NotNull
        String name,
        @NotNull
        String color
) {
}
