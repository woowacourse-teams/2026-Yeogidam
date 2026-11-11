-- 장소를 지도 제공자(KAKAO, GOOGLE)와 제공자 쪽 장소 ID로 가리고, 장소가 있는 나라(ISO 3166-1 alpha-2)를 더한다.
-- 기존 장소는 모두 카카오에서 찾은 국내 장소라서 KAKAO, 카카오 장소 ID, KR로 채운다.
-- 배포하는 동안 이전 컨테이너는 kakao_place_id만 넣으므로, external_place_id는 처음부터 kakao_place_id를 기본값으로 받는다.
-- Google place ID는 대소문자를 가려서 external_place_id는 대소문자를 구분하는 utf8mb4_bin으로 비교한다.
-- kakao_place_id는 구글 장소에서 비우고, 이전 컨테이너가 모두 내려간 뒤 다음 버전에서 지운다.
-- 그때는 external_place_id의 기본값이 kakao_place_id를 가리키므로 기본값을 먼저 지운다.
ALTER TABLE places
    ADD COLUMN map_provider      VARCHAR(20)  NOT NULL DEFAULT 'KAKAO' AFTER id,
    ADD COLUMN external_place_id VARCHAR(255) COLLATE utf8mb4_bin NULL DEFAULT (kakao_place_id) AFTER map_provider,
    ADD COLUMN country_code      CHAR(2)      NOT NULL DEFAULT 'KR' AFTER external_place_id,
    MODIFY COLUMN kakao_place_id VARCHAR(64) NULL;

UPDATE places
SET external_place_id = kakao_place_id
WHERE external_place_id IS NULL;

ALTER TABLE places
    MODIFY COLUMN external_place_id VARCHAR(255) COLLATE utf8mb4_bin NOT NULL DEFAULT (kakao_place_id),
    ADD CONSTRAINT uk_places_map_provider_external_place_id UNIQUE (map_provider, external_place_id);
