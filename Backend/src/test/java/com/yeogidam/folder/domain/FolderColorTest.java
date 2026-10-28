package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

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

    @ParameterizedTest
    @EnumSource(FolderColor.class)
    void 대문자_색_코드로_폴더_색을_찾는다(FolderColor color) {
        assertThat(FolderColor.from(color.name()))
                .isEqualTo(color);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pink", "Pink", "pINK"})
    void 소문자가_섞인_색_코드면_예외가_발생한다(String value) {
        assertThatThrownBy(() -> FolderColor.from(value))
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.INVALID_FOLDER_COLOR);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"BLUE", "#F06292", "BLACK"})
    void 모르는_색_코드면_예외가_발생한다(String value) {
        assertThatThrownBy(() -> FolderColor.from(value))
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.INVALID_FOLDER_COLOR);
    }
}
