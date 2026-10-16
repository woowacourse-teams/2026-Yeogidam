import type {HistoryReel, ReelProcessingStatus} from '../../src/entities/content/types';
import type {SavedPlaceListItem, SavedPlacesApiError} from '../../src/entities/info/types';
import type {Place} from '../../src/entities/place/types';
import type {SharedSaveState} from '../../src/lib/reel-save-state';

// 보관함 화면 테스트들이 함께 쓰는 입력 데이터입니다.

export const NOW = new Date('2026-10-16T09:00:00Z');
export const CREATED_AT = '2026-10-16T09:00:00Z';
export const LINK = 'https://www.instagram.com/reel/abc/';

export const savedPlace = (index: number, name: string): SavedPlaceListItem => ({
  id: `saved-${index}`,
  createdAt: '2026-10-01T00:00:00Z',
  place: {id: `place-${index}`, name, roadAddress: '서울 성동구'},
});
export const CAFE = savedPlace(1, '카페');
export const BAKERY = savedPlace(2, '빵집');

export const GUEST_PLACES: Place[] = [
  {id: 'guest-1', name: '체험 카페', address: '서울', fullAddress: '서울'},
  {id: 'guest-2', name: '체험 빵집', address: '서울', fullAddress: '서울'},
];

export const SERVER_ERROR: SavedPlacesApiError = {
  status: 500,
  errorCode: 'COMMON500_001',
  message: '잠시 후 다시 시도해주세요.',
  retryable: true,
};
export const AUTH_ERROR: SavedPlacesApiError = {
  status: 401,
  errorCode: 'AUTH401_001',
  message: '로그인이 필요해요.',
  retryable: false,
};
export const TIMEOUT_ERROR: SavedPlacesApiError = {
  status: null,
  errorCode: 'CLIENT000_002',
  message: '응답이 늦어지고 있어요.',
  retryable: true,
};

export const reelStatus = (
  id: string,
  status: ReelProcessingStatus['processing_status'],
  createdAt = CREATED_AT,
): ReelProcessingStatus => ({
  id,
  processing_status: status,
  failure_reason: null,
  instagram_thumbnail_url: null,
  created_at: createdAt,
});

export const sharedShare = (reel: ReelProcessingStatus): SharedSaveState => ({
  shareResultId: 'request-1',
  url: LINK,
  status: reel.processing_status,
  source: 'instagram_share',
  reel,
});

export const historyReel = (
  id: string,
  status: HistoryReel['processing_status'],
  createdAt = CREATED_AT,
): HistoryReel => ({
  id,
  instagram_url: LINK,
  instagram_title: null,
  instagram_description: '성수 카페 모음',
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: null,
  processing_status: status,
  failure_reason: null,
  save_mode: null,
  created_at: createdAt,
});

export const listing = (...reels: HistoryReel[]) => ({reels, nextCursor: null});
