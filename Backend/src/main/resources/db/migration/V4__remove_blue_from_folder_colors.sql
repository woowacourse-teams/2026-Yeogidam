-- 폴더 색 CHECK에서 BLUE를 빼고 2.2.0 화면의 7가지 색(RED, ORANGE, YELLOW, GREEN, TEAL, PURPLE, PINK)만 남긴다.
-- 지우기와 다시 만들기를 ALTER 한 문장에 담아, 새 CHECK를 만들지 못하면 기존 CHECK도 그대로 남게 한다.
ALTER TABLE folders
    DROP CHECK chk_folders_color,
    ADD CONSTRAINT chk_folders_color
        CHECK (color IN ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'TEAL', 'PURPLE', 'PINK'));
