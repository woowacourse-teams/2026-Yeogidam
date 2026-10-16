import {deleteSavedPlaces, getSavedPlaces} from '../src/entities/info/api';
import {deleteSavedPlaceAndForget} from '../src/entities/info/saved-place-deletion';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  readSavedPlacesCache,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {PROCESSING_ERROR} from '../src/lib/api/screen-error';
import {SERVER_ERROR, TIMEOUT_ERROR, place} from './support/savedPlacesFixtures';

jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getSavedPlaces: jest.fn(),
}));

const cachedNames = () => readSavedPlacesCache()?.map(cached => cached.name);

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache([place('카페', 'sp-1'), place('빵집', 'sp-2')], getSavedPlacesCacheGeneration());
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSavedPlaces).mockReset();
});

test('지우기에 성공하면 목록을 다시 읽지 않고 그 장소를 캐시에서 뺀다', async () => {
  await expect(deleteSavedPlaceAndForget('sp-1')).resolves.toBeUndefined();

  expect(deleteSavedPlaces).toHaveBeenCalledWith(['sp-1']);
  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['빵집']);
});

test('시간 초과로 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 캐시에서 뺀다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([{id: 'sp-2'} as never]);

  await expect(deleteSavedPlaceAndForget('sp-1')).resolves.toBeUndefined();

  expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  expect(cachedNames()).toEqual(['빵집']);
});

test('시간 초과 뒤 다시 읽은 목록에 남아 있으면 처음의 시간 초과 오류를 던지고 캐시를 그대로 둔다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([{id: 'sp-1'} as never, {id: 'sp-2'} as never]);

  await expect(deleteSavedPlaceAndForget('sp-1')).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('시간 초과 뒤 다시 읽기도 실패하면 다시 읽기 오류 대신 처음의 시간 초과 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndForget('sp-1')).rejects.toEqual(TIMEOUT_ERROR);

  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('시간 초과가 아닌 실패는 목록을 다시 읽지 않고 그 오류를 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(SERVER_ERROR);

  await expect(deleteSavedPlaceAndForget('sp-1')).rejects.toEqual(SERVER_ERROR);

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['카페', '빵집']);
});

test('화면 오류 계약 모양이 아닌 실패는 응답 처리 오류로 맞춰 던진다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(new Error('boom'));

  await expect(deleteSavedPlaceAndForget('sp-1')).rejects.toEqual({...PROCESSING_ERROR});

  expect(getSavedPlaces).not.toHaveBeenCalled();
  expect(cachedNames()).toEqual(['카페', '빵집']);
});
