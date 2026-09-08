package com.yeogidam.place.domain;

/**
 * 릴스에서 추출된 장소.
 * 내부 식별자(id), 외부 정체성(externalSource), 받아온 표시 정보(profile)로 이루어진다.
 * Reel이 외부 정체성인 InstagramUrl을 몸통에 직접 드는 것과 같은 그림이다.
 */
public class Place {

    private final Long id;
    private final PlaceExternalSource externalSource;
    private final PlaceProfile profile;

    public Place(
            Long id,
            PlaceExternalSource externalSource,
            PlaceProfile profile
    ) {
        validate(externalSource, profile);
        this.id = id;
        this.externalSource = externalSource;
        this.profile = profile;
    }

    private void validate(PlaceExternalSource externalSource, PlaceProfile profile) {
        if (externalSource == null) {
            throw new IllegalArgumentException("외부 장소 정보가 비어 있습니다.");
        }
        if (profile == null) {
            throw new IllegalArgumentException("장소 정보가 비어 있습니다.");
        }
    }

    public String summaryAddress() {
        return profile.address().summary();
    }

    public Long id() {
        return id;
    }

    public PlaceExternalSource externalSource() {
        return externalSource;
    }

    public PlaceProfile profile() {
        return profile;
    }
}
