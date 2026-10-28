package com.yeogidam.folder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class FolderAssignmentTest {

    @Test
    void 넣을_폴더에는_새로_고른_폴더만_들어간다() {
        // given: 지금 폴더 1, 2, 3에 담겨 있고, 폴더 2, 3, 4, 5로 바꾸려 한다.
        FolderAssignment folderAssignment = new FolderAssignment(List.of(1L, 2L, 3L));

        // when & then
        assertThat(folderAssignment.selectFolderIdsToAdd(Set.of(2L, 3L, 4L, 5L)))
                .containsExactlyInAnyOrder(4L, 5L);
    }

    @Test
    void 뺄_폴더에는_담겨_있지만_고르지_않은_폴더만_들어간다() {
        // given: 지금 폴더 1, 2, 3에 담겨 있고, 폴더 2, 3, 4, 5로 바꾸려 한다.
        FolderAssignment folderAssignment = new FolderAssignment(List.of(1L, 2L, 3L));

        // when & then
        assertThat(folderAssignment.selectFolderIdsToRemove(Set.of(2L, 3L, 4L, 5L)))
                .containsExactly(1L);
    }

    @Test
    void 담긴_폴더가_없으면_고른_폴더가_모두_넣을_폴더가_된다() {
        // given
        FolderAssignment folderAssignment = new FolderAssignment(List.of());

        // when & then
        assertAll(
                () -> assertThat(folderAssignment.selectFolderIdsToAdd(Set.of(1L, 2L)))
                        .containsExactlyInAnyOrder(1L, 2L),
                () -> assertThat(folderAssignment.selectFolderIdsToRemove(Set.of(1L, 2L)))
                        .isEmpty()
        );
    }

    @Test
    void 폴더를_하나도_고르지_않으면_담긴_폴더가_모두_뺄_폴더가_된다() {
        // given
        FolderAssignment folderAssignment = new FolderAssignment(List.of(1L, 2L));

        // when & then
        assertAll(
                () -> assertThat(folderAssignment.selectFolderIdsToAdd(Set.of())).isEmpty(),
                () -> assertThat(folderAssignment.selectFolderIdsToRemove(Set.of())).containsExactlyInAnyOrder(1L, 2L)
        );
    }

    @Test
    void 고른_폴더가_지금과_같으면_넣을_폴더도_뺄_폴더도_없다() {
        // given
        FolderAssignment folderAssignment = new FolderAssignment(List.of(1L, 2L));

        // when & then
        assertAll(
                () -> assertThat(folderAssignment.selectFolderIdsToAdd(Set.of(1L, 2L))).isEmpty(),
                () -> assertThat(folderAssignment.selectFolderIdsToRemove(Set.of(1L, 2L))).isEmpty()
        );
    }

    @Test
    void 담긴_폴더_목록이_null이면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> new FolderAssignment(null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
