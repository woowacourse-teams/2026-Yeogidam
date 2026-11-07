import {createSpringApiClient} from '../src/lib/api/spring-client';
import {
  deleteSavedMedia,
  getSavedMedia,
  saveMediaPlace,
} from '../src/entities/content/saved-media-api';

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({request: jest.fn()})),
}));

const requests = (createSpringApiClient as jest.Mock).mock.results;
const request = requests[requests.length - 1].value.request as jest.Mock;

beforeEach(() => request.mockReset());

test('보관함 게시물과 장소 저장 상태를 매핑하고 커서 시각을 그대로 보낸다', async () => {
  request.mockResolvedValueOnce({
    sharedMedia: [{
      sharedMediaId: 81,
      createdAt: '2026-11-04T03:12:45.123456Z',
      thumbnailUrl: null,
      caption: '제목\n본문',
      author: 'author',
      sharedUrl: 'https://www.instagram.com/reel/abc/',
      places: [{
        savedPlaceId: null,
        placeId: 42,
        name: '장소',
        category: '카페',
        landLotAddress: '주소',
        roadAddress: '도로명',
        latitude: 37.5,
        longitude: 127.0,
        kakaoPlaceUrl: null,
        thumbnailUrl: null,
      }],
    }],
    nextCursor: {createdAt: '2026-11-04T03:12:45.123456Z', id: 81},
  });

  const page = await getSavedMedia({created_at: '2026-11-05T01:02:03.123456Z', id: '90'});
  expect(request).toHaveBeenCalledWith('/api/v1/saved-media', {
    query: {cursorCreatedAt: '2026-11-05T01:02:03.123456Z', cursorId: '90'},
  });
  expect(page.nextCursor).toEqual({created_at: '2026-11-04T03:12:45.123456Z', id: '81'});
  expect(page.reels[0]).toMatchObject({id: '81', processing_status: 'COMPLETED', extracted_place_count: 1});
  expect(page.reels[0]).not.toHaveProperty('saved_media_places');
});

test('게시물 삭제와 장소 북마크가 서버 계약을 사용한다', async () => {
  request.mockResolvedValueOnce(undefined).mockResolvedValueOnce({savedPlaceId: 123});
  await deleteSavedMedia(['81', '82']);
  await expect(saveMediaPlace('81', '42')).resolves.toBe('123');
  expect(request).toHaveBeenNthCalledWith(1, '/api/v1/saved-media', {
    method: 'DELETE', query: {sharedMediaIds: ['81', '82']},
  });
  expect(request).toHaveBeenNthCalledWith(2, '/api/v1/saved-places', {
    method: 'POST', body: {sharedMediaId: 81, placeId: 42},
  });
});

test('목록 응답의 장소 개수 필드가 있으면 장소 배열보다 우선한다', async () => {
  request.mockResolvedValueOnce({
    sharedMedia: [{
      sharedMediaId: 82,
      createdAt: '2026-11-04T03:12:45Z',
      thumbnailUrl: null,
      caption: null,
      author: null,
      sharedUrl: 'https://www.instagram.com/reel/def/',
      placeCount: 0,
      places: [{placeId: 42}],
    }],
    nextCursor: null,
  });

  const page = await getSavedMedia();
  expect(page.reels[0].extracted_place_count).toBe(0);
});
