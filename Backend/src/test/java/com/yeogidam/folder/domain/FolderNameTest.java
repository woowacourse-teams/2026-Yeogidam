package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class FolderNameTest {

    @Test
    void 앞뒤_공백을_지운_값을_이름으로_쓴다() {
        // when
        FolderName name = new FolderName("  성수 카페 투어  ");

        // then
        assertThat(name.value())
                .isEqualTo("성수 카페 투어");
    }

    @ParameterizedTest
    @ValueSource(strings = {"가", "가나다라마바사아자차카타파하가", "  가나다라마바사아자차카타파하가  "})
    void 앞뒤_공백을_지운_뒤_1자부터_15자까지_허용한다(String value) {
        // when & then
        assertThatCode(() -> new FolderName(value))
                .doesNotThrowAnyException();
    }

    @Test
    void 이름이_15자를_넘으면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new FolderName("가나다라마바사아자차카타파하가나"))
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.INVALID_FOLDER_NAME);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", " ", "　"})
    void 이름이_없거나_공백뿐이면_예외가_발생한다(String value) {
        // when & then
        assertThatThrownBy(() -> new FolderName(value))
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.INVALID_FOLDER_NAME);
    }

    @ParameterizedTest
    @ValueSource(strings = {"카페\n추천", "\n카페", "카페\t", "\r카페", "카페\r\n추천", "카페\u0000"})
    void 줄바꿈이나_탭_같은_제어_문자가_있으면_예외가_발생한다(String value) {
        // when & then
        assertThatThrownBy(() -> new FolderName(value))
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.INVALID_FOLDER_NAME);
    }
}
