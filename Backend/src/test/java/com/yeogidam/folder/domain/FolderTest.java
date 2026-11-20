package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;

class FolderTest {

    @Test
    void 이름과_색을_바꾸면_식별자는_그대로인_새_폴더를_돌려준다() {
        // given
        Folder folder = new Folder(1L, new FolderName("데이트 장소"), FolderColor.RED);

        // when
        Folder changed = folder.change(new FolderName("데이트 코스"), FolderColor.PINK);

        // then
        assertAll(
                () -> assertThat(changed.getId()).isEqualTo(1L),
                () -> assertThat(changed.getName()).isEqualTo(new FolderName("데이트 코스")),
                () -> assertThat(changed.getColor()).isEqualTo(FolderColor.PINK),
                () -> assertThat(folder.getName()).isEqualTo(new FolderName("데이트 장소")),
                () -> assertThat(folder.getColor()).isEqualTo(FolderColor.RED)
        );
    }

    @Test
    void 새로_만든_폴더는_식별자가_없다() {
        // when
        Folder folder = new Folder(new FolderName("가보고 싶은 곳"), FolderColor.GREEN);

        // then
        assertThat(folder.getId())
                .isNull();
    }

    @Test
    void 이름이나_색이_없으면_예외가_발생한다() {
        // given
        FolderName name = new FolderName("데이트 장소");

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> new Folder(null, FolderColor.RED))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new Folder(name, null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
