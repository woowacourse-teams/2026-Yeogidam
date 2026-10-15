import {supabase} from '../../lib/auth/supabase';
import type {HistoryCursor, HistoryReel, HistoryReelDetail} from './types';

// TODO(spring-migration): 히스토리 화면은 아직 Supabase를 씁니다. Spring의 GET /api/v1/shares,
// GET /api/v1/shares/{id}/places, POST /api/v1/shares/{id}/reports로 옮길 때 이 파일을 교체합니다.
const HISTORY_SELECT =
  'id,instagram_url,instagram_title,instagram_description,instagram_author_username,instagram_thumbnail_url,processing_status,failure_reason,save_mode,created_at';
const HISTORY_DETAIL_SELECT = `${HISTORY_SELECT},extraction:reel_extractions!reels_extraction_id_fkey(extraction_places:reel_extraction_places(id,position,place:places(id,name,category,source_address,road_address,address,latitude,longitude,kakao_place_url,thumbnail_url,photo_attribution)))`;

export async function getHistoryReelDetail(
  reelId: string,
): Promise<HistoryReelDetail | null> {
  const request = () =>
    supabase
      .from('reels')
      .select(HISTORY_DETAIL_SELECT)
      .eq('id', reelId)
      .order('position', {
        ascending: true,
        referencedTable: 'extraction.extraction_places',
      })
      .limit(1)
      .returns<HistoryReelDetail[]>();

  let {data, error} = await request();
  if ((error as {status?: number} | null)?.status === 401) {
    const {error: refreshError} = await supabase.auth.refreshSession();
    if (!refreshError) ({data, error} = await request());
  }
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function reportHistoryReel(reelId: string): Promise<void> {
  const {error} = await supabase
    .from('reel_reports')
    .upsert({reel_id: reelId}, {onConflict: 'user_id,reel_id', ignoreDuplicates: true});

  if (error) throw error;
}

export async function getHistoryReels(cursor?: HistoryCursor): Promise<{
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
}> {
  const request = () => {
    let query = supabase
      .from('reels')
      .select(HISTORY_SELECT)
      .order('created_at', {ascending: false})
      .order('id', {ascending: false})
      .limit(51);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      );
    }

    return query.returns<HistoryReel>();
  };

  let {data, error} = await request();
  if (error?.code === 'PGRST301' || error?.message?.includes('401')) {
    const {error: refreshError} = await supabase.auth.refreshSession();
    if (!refreshError) {
      ({data, error} = await request());
    }
  }

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as HistoryReel[];
  const reels = rows.slice(0, 50);
  const last = reels.length === 50 ? reels[reels.length - 1] : null;
  return {
    reels,
    nextCursor: last ? {created_at: last.created_at, id: last.id} : null,
  };
}
