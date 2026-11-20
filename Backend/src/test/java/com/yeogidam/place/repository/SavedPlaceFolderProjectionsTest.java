package com.yeogidam.place.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.util.List;
import org.junit.jupiter.api.Test;

class SavedPlaceFolderProjectionsTest {

    @Test
    void 보관함_항목마다_폴더_ID를_담은_순서대로_꺼낸다() {
        // given
        SavedPlaceFolderProjections folders = new SavedPlaceFolderProjections(List.of(
                new SavedPlaceFolderProjection(11L, 52L),
                new SavedPlaceFolderProjection(12L, 52L),
                new SavedPlaceFolderProjection(11L, 51L)
        ));

        // when & then
        assertAll(
                () -> assertThat(folders.folderIdsOf(11L))
                        .containsExactly(52L, 51L),
                () -> assertThat(folders.folderIdsOf(12L))
                        .containsExactly(52L)
        );
    }

    @Test
    void 해당_보관함_항목이_담긴_폴더가_없으면_빈_목록이다() {
        // given
        SavedPlaceFolderProjections folders = new SavedPlaceFolderProjections(List.of(
                new SavedPlaceFolderProjection(11L, 51L)
        ));

        // when & then
        assertThat(folders.folderIdsOf(12L))
                .isEmpty();
    }

    @Test
    void 폴더_연결이_하나도_없으면_빈_목록이다() {
        // given
        SavedPlaceFolderProjections folders = new SavedPlaceFolderProjections(List.of());

        // when & then
        assertThat(folders.folderIdsOf(11L))
                .isEmpty();
    }
}
