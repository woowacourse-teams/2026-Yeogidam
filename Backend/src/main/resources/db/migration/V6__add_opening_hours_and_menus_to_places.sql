-- 장소 상세에서 읽는 요일별 영업시간과 메뉴 목록이다. 정보가 없는 장소는 NULL로 둔다.
ALTER TABLE places
    ADD COLUMN opening_hours JSON NULL,
    ADD COLUMN menus JSON NULL;
