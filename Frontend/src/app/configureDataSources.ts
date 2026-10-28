import {
  configureCurrentProfileRepository,
  configurePlaceReelsRepository,
  configureSavedPlacesRepository,
} from '../entities/info/api';
import {
  springPlaceReelsRepository,
  springProfileRepository,
  springSavedPlacesRepository,
} from '../entities/info/spring-api';

/**
 * 앱 시작 시 한 번만 실행하는 외부 데이터 소스 설정입니다.
 * 화면은 이 설정이나 Spring API를 직접 알 필요가 없습니다.
 */
export function configureDataSources() {
  configureCurrentProfileRepository(springProfileRepository);
  configureSavedPlacesRepository(springSavedPlacesRepository);
  configurePlaceReelsRepository(springPlaceReelsRepository);
}
