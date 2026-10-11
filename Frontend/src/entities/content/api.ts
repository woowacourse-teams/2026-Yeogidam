import {supabase} from '../../lib/auth/supabase';
import {v4 as uuidv4} from 'uuid';
import type {
  ContentType,
  SaveInstagramReelResponse,
  SaveSource,
  ReelProcessingStatus,
  HistoryCursor,
  HistoryReel,
  ExtractionFailureReason,
  ExtractionRetryResult,
  ExtractionStatus,
  HistoryPlace,
  HistoryRepository,
} from './types';
import {normalizeReelStatusError, reelErrorFromEnvelope, ReelApiError} from './errors';
import { createApiClient, type ApiClientOptions } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import { toIdString } from '../../lib/api/values';

const REEL_STATUS_SELECT =
  'id,processing_status,failure_reason,instagram_thumbnail_url,created_at';

type ServerShareHistoryResponse = {
  sharedMediaId: number;
  createdAt: string;
  thumbnailUrl: string | null;
  caption: string | null;
  author: string | null;
  extractionStatus: ExtractionStatus;
  failureReason: ExtractionFailureReason | null;
  sharedUrl: string;
};

type ServerShareHistoryResponses = {
  sharedMedias: ServerShareHistoryResponse[];
  nextCursor: { createdAt: string; id: number } | null;
};

type ServerShareHistoryPlaceResponse = {
  placeId: number;
  thumbnailUrl: string | null;
  name: string;
  category: string | null;
  landLotAddress: string;
  roadAddress: string | null;
};

type ServerShareHistoryPlaceResponses = {
  places: ServerShareHistoryPlaceResponse[];
};

type ServerExtractionRetryResponse = {
  sharedMediaId: number;
  extractionStatus: ExtractionStatus;
};

/** 서버 공유 이력을 앱 모델로 바꿉니다. 식별자만 문자열로 바꾸고 빠진 값은 null로 둡니다. */
function toHistoryReel(item: ServerShareHistoryResponse): HistoryReel {
  return {
    sharedMediaId: toIdString(item.sharedMediaId),
    createdAt: item.createdAt,
    thumbnailUrl: item.thumbnailUrl ?? null,
    caption: item.caption ?? null,
    author: item.author ?? null,
    extractionStatus: item.extractionStatus,
    failureReason: item.failureReason ?? null,
    sharedUrl: item.sharedUrl,
  };
}

function toHistoryPlace(place: ServerShareHistoryPlaceResponse): HistoryPlace {
  return {
    placeId: toIdString(place.placeId),
    thumbnailUrl: place.thumbnailUrl ?? null,
    name: place.name,
    category: place.category ?? null,
    landLotAddress: place.landLotAddress,
    roadAddress: place.roadAddress ?? null,
  };
}

export function createServerHistoryRepository(
  options: ApiClientOptions,
): HistoryRepository {
  const request = createApiClient(options);

  return {
    async getHistoryReels(cursor) {
      const body = (await request('/api/v1/shares', {
        query: { cursorCreatedAt: cursor?.createdAt, cursorId: cursor?.id },
      })) as ServerShareHistoryResponses;

      return {
        reels: body.sharedMedias.map(toHistoryReel),
        nextCursor: body.nextCursor
          ? {
              createdAt: body.nextCursor.createdAt,
              id: toIdString(body.nextCursor.id),
            }
          : null,
      };
    },
    async getHistoryReelPlaces(sharedMediaId) {
      const body = (await request(
        `/api/v1/shares/${sharedMediaId}/places`,
      )) as ServerShareHistoryPlaceResponses;

      return body.places.map(toHistoryPlace);
    },
    async retryHistoryExtraction(sharedMediaId) {
      const body = (await request(
        `/api/v1/shares/${sharedMediaId}/extraction-retries`,
        { method: 'POST' },
      )) as ServerExtractionRetryResponse;

      return {
        sharedMediaId: toIdString(body.sharedMediaId),
        extractionStatus: body.extractionStatus,
      };
    },
    async reportHistoryReel(sharedMediaId) {
      await request(`/api/v1/shares/${sharedMediaId}/reports`, {
        method: 'POST',
      });
    },
  };
}

/** 서버 주소가 없을 때 쓰는 구현체입니다. 공유 이력이 하나도 없는 회원처럼 동작합니다. */
function createMockHistoryRepository(): HistoryRepository {
  const notFound = async (): Promise<never> => {
    throw new ApiError({
      status: 404,
      errorCode: 'MEDIA404_002',
      message: '존재하지 않는 공유입니다.',
      requestId: null,
    });
  };

  return {
    async getHistoryReels() {
      return { reels: [], nextCursor: null };
    },
    getHistoryReelPlaces: notFound,
    retryHistoryExtraction: notFound,
    reportHistoryReel: notFound,
  };
}

let historyRepository: HistoryRepository = createMockHistoryRepository();

/** 앱 시작 시 서버 구현체를 등록합니다. */
export function configureHistoryApi(options: ApiClientOptions) {
  historyRepository = createServerHistoryRepository(options);
}

export function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  return historyRepository.getHistoryReels(cursor);
}

export function getHistoryReelPlaces(
  sharedMediaId: string,
): Promise<HistoryPlace[]> {
  return historyRepository.getHistoryReelPlaces(sharedMediaId);
}

export function retryHistoryExtraction(
  sharedMediaId: string,
): Promise<ExtractionRetryResult> {
  return historyRepository.retryHistoryExtraction(sharedMediaId);
}

/** 같은 이력을 다시 제보하면 서버가 409 MEDIA409_001로 거절합니다. */
export function reportHistoryReel(sharedMediaId: string): Promise<void> {
  return historyRepository.reportHistoryReel(sharedMediaId);
}

export function detectContentType(url: string): ContentType {
  return normalizeInstagramContentUrl(url) ? 'instagram_reel' : 'unsupported';
}

export function normalizeInstagramContentUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url.trim());
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname !== 'instagram.com') return null;

    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const contentIndex = pathParts.findIndex(
      part => part === 'reel' || part === 'p',
    );
    const shortcode = pathParts[contentIndex + 1];
    if (contentIndex < 0 || !shortcode) return null;

    return `https://www.instagram.com/${pathParts[contentIndex]}/${shortcode}/`;
  } catch {
    // The caller handles unsupported or malformed URLs uniformly.
  }

  return null;
}

export async function saveInstagramReel(
  instagramUrl: string,
  source: SaveSource,
  clientRequestId = uuidv4(),
): Promise<SaveInstagramReelResponse> {
  const {data, error} = await supabase.functions.invoke<SaveInstagramReelResponse>(
    'save-instagram-reel-v2',
    {
      body: {
        instagramUrl,
        source,
        clientRequestId,
      },
    },
  );

  if (error) {
    const context = (error as {context?: Response}).context;
    let envelope: unknown = null;
    if (context) {
      try {
        envelope = await context.clone().json();
      } catch {
        // Network or non-JSON gateway error.
      }
    }
    throw reelErrorFromEnvelope(envelope) ?? new ReelApiError({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
      status: context?.status ?? null,
    });
  }

  if (!data) {
    throw new ReelApiError({
      errorCode: 'CLIENT000_003',
      message: '응답을 처리하지 못했어요.',
    });
  }

  return data;
}

export async function saveContent(
  url: string,
  source: SaveSource,
  clientRequestId?: string,
): Promise<SaveInstagramReelResponse> {
  const normalizedUrl = normalizeInstagramContentUrl(url);

  if (!normalizedUrl) {
    throw new ReelApiError({
      errorCode: 'REEL400_001',
      message: '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.',
      retryable: false,
      field: 'instagramUrl',
    });
  }

  return saveInstagramReel(normalizedUrl, source, clientRequestId);
}

export async function getReelProcessingStatus(
  reelId: string,
): Promise<ReelProcessingStatus | null> {
  const {data, error} = await supabase
    .from('reels')
    .select(REEL_STATUS_SELECT)
    .eq('id', reelId)
    .maybeSingle<ReelProcessingStatus>();

  if (error) {
    throw normalizeReelStatusError(error);
  }

  return data;
}
