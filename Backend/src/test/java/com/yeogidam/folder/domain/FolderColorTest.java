package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FolderColorTest {

    @Test
    void 폴더_색은_빨강부터_분홍까지_7가지가_있다() {
        assertThat(FolderColor.values())
                .containsExactly(
                        FolderColor.RED,
                        FolderColor.ORANGE,
                        FolderColor.YELLOW,
                        FolderColor.GREEN,
                        FolderColor.TEAL,
                        FolderColor.PURPLE,
                        FolderColor.PINK
                );
    }
}
