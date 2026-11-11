import type {ImageSourcePropType} from 'react-native';
import type {MapProvider} from '../place/mapProvider';

export type SaveSource = 'url_input' | 'instagram_share';

export type ContentType = 'instagram_reel' | 'unsupported';

export type SaveInstagramReelResponse = {
  reelId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  placeId?: string;
  placeIds?: string[];
  failureReason?: string;
  reused: boolean;
};

export type ReelProcessingStatus = {
  id: string;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_reason: string | null;
  instagram_thumbnail_url: string | null;
  created_at: string;
};

export type HistoryReel = {
  id: string;
  instagram_url: string | null;
  instagram_title: string | null;
  instagram_description: string | null;
  instagram_author_username: string | null;
  instagram_thumbnail_url: string | null;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  failure_reason: string | null;
  save_mode: string | null;
  created_at: string;
  /** 게시물에서 추출된 장소 수. 게시물 목록 응답에 포함될 때 사용합니다. */
  extracted_place_count?: number;
  /** 이 공유 이력을 이미 제보했는지 여부입니다. */
  reported?: boolean;
  /** 히스토리에 남아 있지만 보관함에서 삭제한 공유입니다. */
  deleted_from_library?: boolean;
  local_thumbnail_source?: ImageSourcePropType;
};

export type HistoryCursor = Pick<HistoryReel, 'created_at' | 'id'>;

export type HistoryPlace = {
  id: string;
  name: string;
  category: string | null;
  source_address: string | null;
  road_address: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  kakao_place_url: string | null;
  // 해외 장소 API(pipeline-version 1)부터 내려옵니다.
  category_code?: string | null;
  category_name?: string | null;
  map_provider?: MapProvider | null;
  country_code?: string | null;
  place_url?: string | null;
  thumbnail_url: string | null;
  photo_attribution: string | null;
  local_thumbnail_source?: ImageSourcePropType;
};

export type HistoryReelPlace = {
  id: string;
  position: number;
  savedPlaceId?: string | null;
  place: HistoryPlace | null;
};

export type HistoryReelDetail = HistoryReel & {
  extraction: {
    extraction_places: HistoryReelPlace[];
  } | null;
};