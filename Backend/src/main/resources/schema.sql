DROP TABLE IF EXISTS instagram_media_report;
DROP TABLE IF EXISTS media_place;
DROP TABLE IF EXISTS instagram_media;
DROP TABLE IF EXISTS place;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE instagram_media (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    shared_url VARCHAR(512) NOT NULL,
    media_shortcode VARCHAR(64) NOT NULL,
    title VARCHAR(255),
    caption VARCHAR(2200),
    thumbnail_url VARCHAR(512),
    author_username VARCHAR(100),
    extraction_status VARCHAR(20) NOT NULL,
    failure_reason VARCHAR(40),
    processing_version INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_media_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE place (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kakao_place_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(255) NOT NULL,
    road_address VARCHAR(255),
    latitude DECIMAL(13, 10) NOT NULL,
    longitude DECIMAL(13, 10) NOT NULL,
    kakao_place_url VARCHAR(512),
    telephone VARCHAR(30),
    thumbnail_url VARCHAR(512),
    thumbnail_source VARCHAR(30),
    photo_attribution VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_place_kakao UNIQUE (kakao_place_id)
);

CREATE TABLE media_place (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    media_id BIGINT NOT NULL,
    place_id BIGINT NOT NULL,
    position INT NOT NULL,
    decision_status VARCHAR(20) NOT NULL DEFAULT 'UNDECIDED',
    decided_at TIMESTAMP,
    CONSTRAINT uk_media_place UNIQUE (media_id, place_id),
    CONSTRAINT fk_link_media FOREIGN KEY (media_id) REFERENCES instagram_media (id),
    CONSTRAINT fk_link_place FOREIGN KEY (place_id) REFERENCES place (id)
);

CREATE TABLE instagram_media_report (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    media_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_media FOREIGN KEY (media_id) REFERENCES instagram_media (id)
);
