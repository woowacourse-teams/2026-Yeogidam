-- 회원이 만든 폴더. 이름은 회원 안에서 하나뿐이고, 개수(최대 10개)와 이름 형식은 애플리케이션이 검사한다.
CREATE TABLE folders
(
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    member_id  BIGINT       NOT NULL,
    name       VARCHAR(15)  NOT NULL,
    color      VARCHAR(20)  NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_folders_member_name UNIQUE (member_id, name),
    CONSTRAINT chk_folders_color
        CHECK (color IN ('BLUE', 'RED', 'ORANGE', 'YELLOW', 'GREEN', 'TEAL', 'PURPLE', 'PINK')),
    CONSTRAINT fk_folders_member FOREIGN KEY (member_id)
        REFERENCES members (id)
        ON DELETE CASCADE
);
