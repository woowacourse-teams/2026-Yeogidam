DROP TABLE IF EXISTS media_share_report;
DROP TABLE IF EXISTS share_place;
DROP TABLE IF EXISTS media_place;
DROP TABLE IF EXISTS media_share;
DROP TABLE IF EXISTS instagram_media;
DROP TABLE IF EXISTS place;
DROP TABLE IF EXISTS member;

CREATE TABLE member (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 게시물. shortcode로 유일하며 추출 상태와 결과의 주인이다. 사용자와 공유 사건을 모른다.
CREATE TABLE instagram_media (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    media_shortcode VARCHAR(64) NOT NULL,
    title VARCHAR(255),
    caption VARCHAR(2200),
    thumbnail_url VARCHAR(512),
    author_username VARCHAR(100),
    extraction_status VARCHAR(20) NOT NULL,
    failure_reason VARCHAR(40),
    processing_version INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_media_shortcode UNIQUE (media_shortcode)
);

-- 공유 사건. 같은 게시물을 다시 공유해도 새 행이 생겨 이력이 쌓인다.
CREATE TABLE media_share (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    media_id BIGINT NOT NULL,
    shared_url VARCHAR(512) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_share_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT fk_share_media FOREIGN KEY (media_id) REFERENCES instagram_media (id)
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

-- 추출 사실. 이 게시물에서 이 장소가 나왔다는 것만 들고 결정은 모른다.
CREATE TABLE media_place (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    media_id BIGINT NOT NULL,
    place_id BIGINT NOT NULL,
    position INT NOT NULL,
    CONSTRAINT uk_media_place UNIQUE (media_id, place_id),
    CONSTRAINT fk_fact_media FOREIGN KEY (media_id) REFERENCES instagram_media (id),
    CONSTRAINT fk_fact_place FOREIGN KEY (place_id) REFERENCES place (id)
);

-- 공유 건에 발급된 후보와 사용자 결정. 결정 전이는 조건부 UPDATE가 guard를 겸한다.
CREATE TABLE share_place (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    share_id BIGINT NOT NULL,
    place_id BIGINT NOT NULL,
    position INT NOT NULL,
    decision_status VARCHAR(20) NOT NULL DEFAULT 'UNDECIDED',
    decided_at TIMESTAMP,
    CONSTRAINT uk_share_place UNIQUE (share_id, place_id),
    CONSTRAINT fk_candidate_share FOREIGN KEY (share_id) REFERENCES media_share (id),
    CONSTRAINT fk_candidate_place FOREIGN KEY (place_id) REFERENCES place (id)
);

-- 제보는 공유 건 대상이다.
CREATE TABLE media_share_report (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    share_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_share FOREIGN KEY (share_id) REFERENCES media_share (id)
);
