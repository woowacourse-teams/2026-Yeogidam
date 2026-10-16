import {readSavedPlacesCache} from '../../src/entities/info/saved-places-cache';

/** 보관함 캐시에 든 장소 이름 목록입니다. 캐시가 비어 있으면 undefined입니다. 캐시 모듈은 항목 내용을 바꾸지 않으므로 이름만으로 항목을 가립니다. */
export const cachedPlaceNames = () => readSavedPlacesCache()?.map(cached => cached.name);
