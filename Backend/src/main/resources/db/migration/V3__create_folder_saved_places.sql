-- 폴더와 보관함 장소의 연결. 한 장소를 여러 폴더에 담을 수 있고, 같은 폴더에는 한 번만 담긴다.
CREATE TABLE folder_saved_places
(
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    folder_id      BIGINT       NOT NULL,
    saved_place_id BIGINT       NOT NULL,
    created_at     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_folder_saved_places_folder_saved_place UNIQUE (folder_id, saved_place_id),
    CONSTRAINT fk_folder_saved_places_folder FOREIGN KEY (folder_id)
        REFERENCES folders (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_folder_saved_places_saved_place FOREIGN KEY (saved_place_id)
        REFERENCES saved_places (id)
        ON DELETE CASCADE
);
