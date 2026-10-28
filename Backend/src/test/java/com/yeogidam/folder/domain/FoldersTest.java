package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.folder.exception.FolderException;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class FoldersTest {

    @ParameterizedTest
    @ValueSource(ints = {0, 9})
    void 가진_폴더가_10개보다_적으면_하나_더_만들_수_있다(int count) {
        // given
        Folders folders = new Folders(foldersOf(count));

        // when & then
        assertThatCode(folders::validateAddable)
                .doesNotThrowAnyException();
    }

    @Test
    void 가진_폴더가_10개일_때_하나_더_만들면_예외가_발생한다() {
        // given
        Folders folders = new Folders(foldersOf(10));

        // when & then
        assertThatThrownBy(folders::validateAddable)
                .isInstanceOf(FolderException.class)
                .extracting("errorCode")
                .isEqualTo(FolderErrorCode.FOLDER_LIMIT_EXCEEDED);
    }

    @Test
    void 폴더_목록이_없으면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new Folders(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private List<Folder> foldersOf(int count) {
        return LongStream.rangeClosed(1, count)
                .mapToObj(id -> new Folder(id, new FolderName("폴더 " + id), FolderColor.RED))
                .toList();
    }
}
