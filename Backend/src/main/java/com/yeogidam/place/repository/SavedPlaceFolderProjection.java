package com.yeogidam.place.repository;

/**
 * 보관함 항목 하나와 폴더 하나의 연결이며, folder_saved_places 한 행의 열 이름을 따른다.
 */
public record SavedPlaceFolderProjection(Long savedPlaceId, Long folderId) {

}
