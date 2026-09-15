CREATE TABLE IF NOT EXISTS members (
    id BIGINT NOT NULL AUTO_INCREMENT,
    oauth_provider VARCHAR(20) NOT NULL,
    provider_user_id VARBINARY(255) NOT NULL,
    nickname VARCHAR(255),
    email VARCHAR(320),
    image_url VARCHAR(512),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_members_oauth_account UNIQUE (oauth_provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    session_id CHAR(36) NOT NULL,
    member_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_refresh_sessions_session_id UNIQUE (session_id),
    CONSTRAINT fk_refresh_sessions_member FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON DELETE CASCADE
);
