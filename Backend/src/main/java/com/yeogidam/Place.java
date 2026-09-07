package com.yeogidam;

import lombok.Getter;

@Getter
public class Place {

    private Long id;

    private final PlaceName name;
    private final PlaceCategory category;

    public Place(
            String name,
            String category
    ) {
        this.name = new PlaceName(name);
        this.category = new PlaceCategory(category);
    }
}
