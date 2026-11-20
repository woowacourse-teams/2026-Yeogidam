package com.yeogidam.folder.domain;

import lombok.Getter;

/**
 * 회원이 보관함 장소를 묶으려고 만든 폴더로, 이름과 색을 든다.
 */
@Getter
public class Folder {

    private final Long id;
    private final FolderName name;
    private final FolderColor color;

    public Folder(
            FolderName name,
            FolderColor color
    ) {
        this(null, name, color);
    }

    public Folder(
            Long id,
            FolderName name,
            FolderColor color
    ) {
        validate(name, color);
        this.id = id;
        this.name = name;
        this.color = color;
    }

    private void validate(FolderName name, FolderColor color) {
        if (name == null) {
            throw new IllegalArgumentException("폴더 이름이 비어 있습니다.");
        }
        if (color == null) {
            throw new IllegalArgumentException("폴더 색이 비어 있습니다.");
        }
    }

    public Folder change(FolderName name, FolderColor color) {
        return new Folder(id, name, color);
    }
}
