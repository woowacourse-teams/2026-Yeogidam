package com.yeogidam.place.domain;

import java.time.LocalDateTime;

/**
 * 보관함의 장소 하나. 회원과 장소당 하나만 존재한다(DB UNIQUE가 보장).
 * 다른 공유에서 같은 장소를 다시 저장하면 행이 늘지 않고 saveAgain으로 마지막 저장 시각만 갱신된다(멱등).
 */
public class SavedPlace {

    private final Long id;
    private final Long memberId;
    private final Long placeId;
    private final LocalDateTime firstSavedAt;
    private LocalDateTime lastSavedAt;

    public SavedPlace(
            Long memberId,
            Long placeId,
            LocalDateTime savedAt
    ) {
        this(null, memberId, placeId, savedAt, savedAt);
    }

    public SavedPlace(
            Long id,
            Long memberId,
            Long placeId,
            LocalDateTime firstSavedAt,
            LocalDateTime lastSavedAt
    ) {
        validate(memberId, placeId, firstSavedAt, lastSavedAt);
        this.id = id;
        this.memberId = memberId;
        this.placeId = placeId;
        this.firstSavedAt = firstSavedAt;
        this.lastSavedAt = lastSavedAt;
    }

    private void validate(
            Long memberId,
            Long placeId,
            LocalDateTime firstSavedAt,
            LocalDateTime lastSavedAt
    ) {
        if (memberId == null) {
            throw new IllegalArgumentException("저장한 회원이 비어 있습니다.");
        }
        if (placeId == null) {
            throw new IllegalArgumentException("저장할 장소가 비어 있습니다.");
        }
        if (firstSavedAt == null || lastSavedAt == null) {
            throw new IllegalArgumentException("저장 시각이 비어 있습니다.");
        }
    }

    public void saveAgain(LocalDateTime savedAt) {
        if (savedAt == null) {
            throw new IllegalArgumentException("저장 시각이 비어 있습니다.");
        }
        this.lastSavedAt = savedAt;
    }

    public Long id() {
        return id;
    }

    public Long memberId() {
        return memberId;
    }

    public Long placeId() {
        return placeId;
    }

    public LocalDateTime firstSavedAt() {
        return firstSavedAt;
    }

    public LocalDateTime lastSavedAt() {
        return lastSavedAt;
    }
}
