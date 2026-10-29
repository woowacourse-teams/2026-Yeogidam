package com.yeogidam.place.repository;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 담은 순서로 조회한 폴더 연결을 보관함 항목별로 한 번 묶고, 각 항목의 폴더 ID를 같은 순서로 돌려준다.
 */
public class SavedPlaceFolderProjections {

    private final Map<Long, List<Long>> folderIdsBySavedPlace;

    public SavedPlaceFolderProjections(List<SavedPlaceFolderProjection> links) {
        this.folderIdsBySavedPlace = links.stream()
                .collect(Collectors.groupingBy(
                        SavedPlaceFolderProjection::savedPlaceId,
                        Collectors.mapping(SavedPlaceFolderProjection::folderId, Collectors.toUnmodifiableList())
                ));
    }

    /**
     * 보관함 항목이 담긴 폴더 ID를 담은 순서대로 돌려주고, 담긴 폴더가 없으면 빈 목록을 돌려준다.
     */
    public List<Long> folderIdsOf(Long savedPlaceId) {
        return folderIdsBySavedPlace.getOrDefault(savedPlaceId, List.of());
    }
}
