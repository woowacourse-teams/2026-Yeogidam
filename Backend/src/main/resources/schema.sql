DROP TABLE IF EXISTS shared_media_reports;
DROP TABLE IF EXISTS shared_media_saved_places;
DROP TABLE IF EXISTS saved_places;
DROP TABLE IF EXISTS place_candidates;
DROP TABLE IF EXISTS media_places;
DROP TABLE IF EXISTS shared_media;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS places;
DROP TABLE IF EXISTS refresh_sessions;
DROP TABLE IF EXISTS members;

CREATE TABLE members
(
    id               BIGINT      NOT NULL AUTO_INCREMENT,
    oauth_provider   VARCHAR(20) NOT NULL,
    provider_user_id VARBINARY(255) NOT NULL,
    nickname         VARCHAR(255),
    email            VARCHAR(320),
    image_url        VARCHAR(512),
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_members_oauth_account UNIQUE (oauth_provider, provider_user_id)
);

CREATE TABLE refresh_sessions
(
    id         BIGINT    NOT NULL AUTO_INCREMENT,
    session_id CHAR(36)  NOT NULL,
    member_id  BIGINT    NOT NULL,
    token_hash CHAR(64)  NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked    BOOLEAN   NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_refresh_sessions_session_id UNIQUE (session_id),
    CONSTRAINT fk_refresh_sessions_member FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON DELETE CASCADE
);

-- 게시물. shortcode로 유일하며 추출 상태와 결과의 주인이다. 사용자와 공유 사건을 모른다.
CREATE TABLE media
(
    id                 BIGINT      NOT NULL AUTO_INCREMENT,
    media_shortcode    VARCHAR(64) NOT NULL,
    caption            TEXT,
    thumbnail_url      VARCHAR(2048),
    author             VARCHAR(100),
    extraction_status  VARCHAR(20) NOT NULL,
    failure_reason     VARCHAR(40),
    extraction_version INT         NOT NULL,
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_type        VARCHAR(20) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_media_shortcode UNIQUE (media_shortcode),
    CONSTRAINT chk_media_extraction_status
        CHECK (extraction_status IN ('EXTRACTING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT chk_media_source_type
        CHECK (source_type IN ('EXTRACTED', 'SEEDED')),
    CONSTRAINT chk_media_failure_reason
        CHECK (failure_reason IN ('CONTENT_UNAVAILABLE', 'PLACE_NOT_EXTRACTED', 'PLACE_NOT_MATCHED', 'UNEXPECTED')),
    -- failure_reason은 extraction_status가 FAILED일 때만 들어가고, 재시도로 EXTRACTING이 되면 같은 UPDATE에서 비운다.
    CONSTRAINT chk_media_failure_reason_only_when_failed CHECK (
        (extraction_status = 'FAILED' AND failure_reason IS NOT NULL)
            OR
        (extraction_status <> 'FAILED' AND failure_reason IS NULL)
        )
);

-- 공유 사건. 같은 게시물을 다시 공유해도 새 행이 생겨 이력이 쌓인다.
CREATE TABLE shared_media
(
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    member_id  BIGINT       NOT NULL,
    media_id   BIGINT       NOT NULL,
    shared_url VARCHAR(512) NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_shared_media_member FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_shared_media_media FOREIGN KEY (media_id)
        REFERENCES media (id)
);

CREATE TABLE places
(
    id                    BIGINT          NOT NULL AUTO_INCREMENT,
    kakao_place_id        VARCHAR(64)     NOT NULL,
    name                  VARCHAR(255)    NOT NULL,
    category              VARCHAR(100),
    land_lot_address      VARCHAR(255)    NOT NULL,
    road_address          VARCHAR(255),
    latitude              DECIMAL(13, 10) NOT NULL,
    longitude             DECIMAL(13, 10) NOT NULL,
    kakao_place_url       VARCHAR(512),
    telephone             VARCHAR(30),
    thumbnail_url         VARCHAR(2048),
    thumbnail_source      VARCHAR(30),
    thumbnail_attribution VARCHAR(255),
    created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_places_kakao_place_id UNIQUE (kakao_place_id)
);

-- 추출 사실. 이 게시물에서 이 장소가 나왔다는 것만 들고 결정은 모른다.
CREATE TABLE media_places
(
    id       BIGINT NOT NULL AUTO_INCREMENT,
    media_id BIGINT NOT NULL,
    place_id BIGINT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_media_places_media_place UNIQUE (media_id, place_id),
    CONSTRAINT fk_media_places_media FOREIGN KEY (media_id)
        REFERENCES media (id),
    CONSTRAINT fk_media_places_place FOREIGN KEY (place_id)
        REFERENCES places (id)
);

-- 공유 건에 발급된 후보와 사용자 결정. 결정 전이는 조건부 UPDATE가 guard를 겸한다.
CREATE TABLE place_candidates
(
    id              BIGINT      NOT NULL AUTO_INCREMENT,
    shared_media_id BIGINT      NOT NULL,
    place_id        BIGINT      NOT NULL,
    decision_status VARCHAR(20) NOT NULL DEFAULT 'UNDECIDED',
    decided_at      TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_place_candidates_shared_media_place UNIQUE (shared_media_id, place_id),
    CONSTRAINT chk_place_candidates_decision_status
        CHECK (decision_status IN ('UNDECIDED', 'SAVED', 'DISCARDED', 'SUPERSEDED')),
    CONSTRAINT fk_place_candidates_shared_media FOREIGN KEY (shared_media_id)
        REFERENCES shared_media (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_place_candidates_place FOREIGN KEY (place_id)
        REFERENCES places (id)
);

-- 보관함. 회원과 장소당 하나를 DB 제약이 보장하고, 재저장은 last_saved_at만 갱신된다.
CREATE TABLE saved_places
(
    id            BIGINT    NOT NULL AUTO_INCREMENT,
    member_id     BIGINT    NOT NULL,
    place_id      BIGINT    NOT NULL,
    last_saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_saved_places_member_place UNIQUE (member_id, place_id),
    CONSTRAINT fk_saved_places_member FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_saved_places_place FOREIGN KEY (place_id)
        REFERENCES places (id)
);

-- 보관함 장소와 그 장소를 저장하게 된 공유 건의 연결. 핀에서 원본 릴스 목록으로 돌아가는 길이다.
CREATE TABLE shared_media_saved_places
(
    id              BIGINT    NOT NULL AUTO_INCREMENT,
    saved_place_id  BIGINT    NOT NULL,
    shared_media_id BIGINT    NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_shared_media_saved_places_saved_place_shared_media UNIQUE (saved_place_id, shared_media_id),
    CONSTRAINT fk_shared_media_saved_places_saved_place FOREIGN KEY (saved_place_id)
        REFERENCES saved_places (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_shared_media_saved_places_shared_media FOREIGN KEY (shared_media_id)
        REFERENCES shared_media (id)
        ON DELETE CASCADE
);

-- 제보는 공유 건 대상이다.
CREATE TABLE shared_media_reports
(
    id              BIGINT    NOT NULL AUTO_INCREMENT,
    shared_media_id BIGINT    NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_shared_media_reports_shared_media UNIQUE (shared_media_id),
    CONSTRAINT fk_shared_media_reports_shared_media FOREIGN KEY (shared_media_id)
        REFERENCES shared_media (id)
        ON DELETE CASCADE
);
