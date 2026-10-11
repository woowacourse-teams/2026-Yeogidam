import {v4 as uuidv4} from 'uuid';
import type {
  ContentType,
  HistoryCursor,
  HistoryReel,
  ExtractionFailureReason,
  ExtractionRetryResult,
  ExtractionStatus,
  HistoryPlace,
  HistoryRepository,
  ShareResult,
} from './types';
import { createApiClient, type ApiClientOptions } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import { toIdString } from '../../lib/api/values';

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

type ServerShareResponse = {
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
    async createShare(instagramUrl) {
      // 서버는 아직 clientRequestId를 읽지 않지만 멱등 처리를 붙일 자리로 계속 보냅니다.
      const body = (await request('/api/v1/shares', {
        method: 'POST',
        body: { instagramUrl, clientRequestId: uuidv4() },
      })) as ServerShareResponse;

      return {
        sharedMediaId: toIdString(body.sharedMediaId),
        extractionStatus: body.extractionStatus,
      };
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
    // 목 목록에는 항목을 더할 수 없어, 이미 분석이 끝난 게시물을 다시 공유한 것처럼 끝냅니다.
    async createShare() {
      return { sharedMediaId: '0', extractionStatus: 'SUCCEEDED' };
    },
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

/** 정규화한 인스타그램 링크를 공유 이력으로 접수합니다. */
export function createShare(instagramUrl: string): Promise<ShareResult> {
  return historyRepository.createShare(instagramUrl);
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
