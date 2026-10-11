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

export type MatchFailureStage = 'KAKAO_SEARCH' | 'AI_REVIEW' | 'FINAL_GUARD';

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

export type ProfileApiError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};

export type UpdateCurrentProfileInput = {
  nickname?: string;
  description?: string;
  avatarUrl?: string | null;
};

export type CurrentProfileRepository = {
  getCurrentProfile: () => Promise<ProfileInfo>;
};

export type InfoPlace = {
  id: string;
  kakaoPlaceId?: string | null;
  googlePlaceId?: string | null;
  name: string;
  category?: string | null;
  roadAddress?: string | null;
  landLotAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  kakaoPlaceUrl?: string | null;
  telephone?: string | null;
  thumbnailUrl?: string | null;
  /** 서버 코드가 쓰는 값은 'KAKAO', 'INSTAGRAM'이지만 열이 자유 문자열이라 string으로 받습니다. */
  thumbnailSource?: string | null;
  photoAttribution?: string | null;
  createdAt: string;
};

export type ReelInfo = {
  id: string;
  userId: string;
  placeId?: string | null;
  instagramUrl: string;
  instagramAuthorUsername: string | null;
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

/** 장소 상세의 완료된 Instagram 릴스 조회 모델입니다. */
export type PlaceReel = Pick<
  ReelInfo,
  | 'id'
  | 'instagramUrl'
  | 'instagramAuthorUsername'
  | 'instagramDescription'
  | 'instagramThumbnailUrl'
  | 'createdAt'
>;

export type PlaceReelsApiError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};

export type PlaceReelsRepository = {
  getPlaceReels: (savedPlaceId: string) => Promise<PlaceReel[]>;
};

export type SavedPlaceInfo = {
  id: string;
  userId: string;
  placeId: string;
  thumbnailUrl?: string | null;
  createdAt: string;
  lastSavedAt?: string;
};

/**
 * `GET /api/v1/saved-places`의 항목 하나를 옮긴 목록 항목입니다. 서버 식별자(Long)는 문자열로 바꾸고,
 * 썸네일처럼 비어 있는 값은 null 그대로 둡니다.
 */
export type SavedPlaceListItem = {
  /** 보관함 항목 id(savedPlaceId)입니다. 삭제와 장소별 릴스 조회가 이 값을 씁니다. */
  id: string;
  lastSavedAt: string;
  place: Pick<
    InfoPlace,
    | 'id'
    | 'name'
    | 'category'
    | 'landLotAddress'
    | 'roadAddress'
    | 'latitude'
    | 'longitude'
    | 'kakaoPlaceUrl'
    | 'telephone'
    | 'thumbnailUrl'
    | 'thumbnailSource'
  > & {
    /** 카드에 쓰는 짧은 주소입니다. 서버가 내리지 않아 지번 주소의 앞 두 어절로 만듭니다. */
    shortAddress: string;
  };
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
  deleteSavedPlaces: (savedPlaceIds: string[]) => Promise<void>;
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
