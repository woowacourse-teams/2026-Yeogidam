export type ThumbnailSource =
  | 'google_places'
  | 'instagram'
  | 'kakao'
  | 'manual';

export type ReelSource = 'instagram_share' | 'url_input';

export type ReelProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type ReelFailureReason =
  | 'IG_FETCH_FAILED'
  | 'IG_CAPTION_NOT_FOUND'
  | 'PROVIDER_CONFIG_MISSING'
  | 'GEMINI_PLACE_NOT_FOUND'
  | 'KAKAO_PLACE_NOT_FOUND'
  | 'PLACE_NOT_FOUND'
  | 'UNKNOWN';

export type MatchFailureStage =
  | 'KAKAO_SEARCH'
  | 'AI_REVIEW'
  | 'FINAL_GUARD';

export type MatchFailureReason =
  | 'NO_KAKAO_CANDIDATE'
  | 'NO_KAKAO_CANDIDATE_AFTER_EXPANSION'
  | 'AI_JUDGMENT_UNAVAILABLE'
  | 'AMBIGUOUS_SAME_NAME'
  | 'NAME_MISMATCH'
  | 'ADDRESS_CONFLICT'
  | 'INSUFFICIENT_CONTEXT'
  | 'AI_SELECTED_UNKNOWN_CANDIDATE'
  | 'REGION_CONFLICT'
  | 'ROAD_CONFLICT'
  | 'BUILDING_NUMBER_CONFLICT'
  | 'UNRESOLVED_MULTI_REGION'
  | 'INSUFFICIENT_ADDRESS_EVIDENCE';

export type SearchOrigin = 'INITIAL' | 'EXPANDED_NAME_ONLY';

export type ClassifierReason =
  | 'NO_VERIFIED_CANDIDATE'
  | 'MULTIPLE_VERIFIED_CANDIDATES';

export type ProfileInfo = {
  id: string;
  nickname?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InfoPlace = {
  id: string;
  kakaoPlaceId?: string | null;
  googlePlaceId?: string | null;
  name: string;
  category?: string | null;
  roadAddress?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  kakaoPlaceUrl?: string | null;
  telephone?: string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: ThumbnailSource | null;
  photoAttribution?: string | null;
  sourceAddress?: string | null;
  createdAt: string;
};

export type ReelInfo = {
  id: string;
  userId: string;
  placeId?: string | null;
  instagramUrl: string;
  instagramTitle?: string | null;
  instagramDescription?: string | null;
  instagramThumbnailUrl?: string | null;
  source: ReelSource;
  processingStatus: ReelProcessingStatus;
  failureReason?: ReelFailureReason | null;
  instagramShortcode?: string | null;
  processingVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type SavedPlaceInfo = {
  id: string;
  userId: string;
  placeId: string;
  thumbnailUrl?: string | null;
  createdAt: string;
};

/** `saved_places`와 `places` 조인 조회에 사용하는 목록 항목입니다. */
export type SavedPlaceListItem = Pick<
  SavedPlaceInfo,
  'id' | 'thumbnailUrl' | 'createdAt'
> & {
  place: Pick<
    InfoPlace,
    | 'id'
    | 'name'
    | 'category'
    | 'sourceAddress'
    | 'roadAddress'
    | 'address'
    | 'latitude'
    | 'longitude'
    | 'kakaoPlaceUrl'
    | 'thumbnailUrl'
    | 'photoAttribution'
  >;
};

export type SavedPlacesApiError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};

/** 화면이 의존하는 저장 장소 조회 계약입니다. 데이터 제공자가 바뀌어도 이 형태는 유지합니다. */
export type SavedPlacesRepository = {
  getSavedPlaces: () => Promise<SavedPlaceListItem[]>;
};

export type ProviderUsageMonthly = {
  provider: string;
  monthStart: string;
  requestCount: number;
  updatedAt: string;
};

export type ReelPlaceInfo = {
  reelId: string;
  placeId: string;
  position: number;
  createdAt: string;
};

export type ReelPlaceMatchFailure = {
  reelId: string;
  guessIndex: number;
  placeName: string;
  sourceAddress?: string | null;
  sourceRegion?: string | null;
  failureStage: MatchFailureStage;
  failureReason: MatchFailureReason;
  searchOrigin: SearchOrigin;
  classifierReason?: ClassifierReason | null;
  candidateCount: number;
  candidateIds: string[];
  createdAt: string;
};

export type FrontendInfoDomain = {
  profiles: ProfileInfo[];
  places: InfoPlace[];
  reels: ReelInfo[];
  savedPlaces: SavedPlaceInfo[];
  providerUsageMonthly: ProviderUsageMonthly[];
  reelPlaces: ReelPlaceInfo[];
  reelPlaceMatchFailures: ReelPlaceMatchFailure[];
};
