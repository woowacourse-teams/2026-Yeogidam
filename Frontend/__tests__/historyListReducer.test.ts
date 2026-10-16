import type {HistoryCursor, HistoryReel} from '../src/entities/content/types';
import {
  canLoadMore,
  createHistoryListState,
  historyListReducer,
  type HistoryListAction,
  type HistoryListState,
  type HistoryPage,
} from '../src/pages/history/history-list';

const reel = (id: number, status: HistoryReel['processing_status'] = 'COMPLETED'): HistoryReel => ({
  id: String(id),
  instagram_url: `https://www.instagram.com/reel/${id}/`,
  instagram_title: null,
  instagram_description: `게시물 ${id}`,
  instagram_author_username: 'yeogidam',
  instagram_thumbnail_url: `https://cdn.example.com/${id}.jpg`,
  processing_status: status,
  failure_reason: null,
  save_mode: null,
  created_at: '2026-10-15T00:00:00Z',
});

const FIRST_CURSOR: HistoryCursor = {created_at: '2026-10-14T00:00:00Z', id: '3'};
const SECOND_CURSOR: HistoryCursor = {created_at: '2026-10-13T00:00:00Z', id: '1'};

const page = (ids: number[], nextCursor: HistoryCursor | null = null): HistoryPage => ({
  reels: ids.map(id => reel(id)),
  nextCursor,
});

const ids = (state: HistoryListState) => state.reels.map(item => item.id);

function run(initial: HistoryListState, ...actions: HistoryListAction[]): HistoryListState {
  return actions.reduce(historyListReducer, initial);
}

const MEMBER = createHistoryListState();
const LOADED = run(MEMBER, {type: 'firstPageLoaded', page: page([5, 4, 3], FIRST_CURSOR)});

describe('historyListReducer: 시작과 첫 페이지', () => {
  test('회원은 첫 페이지를 읽는 중으로, 비회원은 체험 목록을 다 읽은 상태로 시작한다', () => {
    expect(MEMBER).toEqual({
      status: 'loading',
      reels: [],
      cursor: null,
      more: {status: 'idle'},
      hasLoadedMore: false,
    });
    const guestReels = [reel(1)];
    const guest = createHistoryListState(guestReels);
    expect(guest.status).toBe('success');
    expect(guest.reels).toBe(guestReels);
    expect(canLoadMore(guest)).toBe(false);
  });

  test('첫 페이지를 받으면 목록과 커서를 바꾸고, 실패하면 오류로 둔다', () => {
    expect(LOADED.status).toBe('success');
    expect(ids(LOADED)).toEqual(['5', '4', '3']);
    expect(LOADED.cursor).toBe(FIRST_CURSOR);

    expect(run(MEMBER, {type: 'firstPageFailed'}).status).toBe('error');
  });

  test('첫 페이지를 다시 요청하면 로딩으로 두고 더 보기 실패와 이어 읽은 표시를 지운다', () => {
    const failedMore = run(
      LOADED,
      {type: 'morePageRequested'},
      {type: 'morePageLoaded', page: page([2], SECOND_CURSOR)},
      {type: 'morePageRequested'},
      {type: 'morePageFailed', cursor: SECOND_CURSOR},
    );
    expect(failedMore.more).toEqual({status: 'error', cursor: SECOND_CURSOR});
    expect(failedMore.hasLoadedMore).toBe(true);

    const requested = run(failedMore, {type: 'firstPageRequested'});
    expect(requested.status).toBe('loading');
    expect(requested.more).toEqual({status: 'idle'});
    expect(requested.hasLoadedMore).toBe(false);
    // 목록은 새 첫 페이지가 올 때까지 그대로 둔다.
    expect(requested.reels).toBe(failedMore.reels);
  });

  test('이전 기록을 읽는 중에 첫 페이지를 다시 요청해도 더 보기 진행 표시는 남긴다', () => {
    const loadingMore = run(LOADED, {type: 'morePageRequested'});
    expect(run(loadingMore, {type: 'firstPageRequested'}).more).toEqual({status: 'loading'});
  });

  test('바뀐 값이 없으면 같은 상태 객체를 돌려줘 다시 그리지 않는다', () => {
    // 첫 렌더 직후의 첫 페이지 요청과 비회원 목록 다시 넣기가 여기에 해당한다.
    expect(historyListReducer(MEMBER, {type: 'firstPageRequested'})).toBe(MEMBER);
    const guest = createHistoryListState([reel(1)]);
    expect(historyListReducer(guest, {type: 'guestReelsLoaded', reels: guest.reels})).toBe(guest);
    const failedMore = run(LOADED, {type: 'morePageFailed', cursor: FIRST_CURSOR});
    expect(historyListReducer(failedMore, {type: 'morePageFailed', cursor: FIRST_CURSOR})).toBe(
      failedMore,
    );
  });
});

describe('historyListReducer: 폴링과 다시 읽기', () => {
  test('다시 읽은 첫 페이지를 앞에 두고 겹치지 않는 이전 항목은 뒤에 남긴다', () => {
    const withMore = run(LOADED, {type: 'morePageLoaded', page: page([2, 1], SECOND_CURSOR)});
    const refreshed = run(withMore, {type: 'refreshLoaded', page: page([6, 5, 4], FIRST_CURSOR)});
    expect(ids(refreshed)).toEqual(['6', '5', '4', '3', '2', '1']);
  });

  test('첫 페이지만 읽었으면 커서를 바꾸고, 이어 읽은 뒤에는 커서를 그대로 둔다', () => {
    const onlyFirst = run(LOADED, {type: 'refreshLoaded', page: page([6, 5, 4], SECOND_CURSOR)});
    expect(onlyFirst.cursor).toBe(SECOND_CURSOR);

    const reachedEnd = run(LOADED, {type: 'morePageLoaded', page: page([2, 1], null)});
    const polled = run(reachedEnd, {type: 'refreshLoaded', page: page([5, 4, 3], FIRST_CURSOR)});
    expect(polled.cursor).toBeNull();
    expect(canLoadMore(polled)).toBe(false);
  });

  test('다시 읽은 결과는 오류를 지우지만 첫 페이지 로딩은 그대로 둔다', () => {
    const failed = run(MEMBER, {type: 'firstPageFailed'});
    expect(run(failed, {type: 'refreshLoaded', page: page([1])}).status).toBe('success');

    const stillLoading = run(MEMBER, {type: 'refreshLoaded', page: page([1])});
    expect(stillLoading.status).toBe('loading');
    expect(ids(stillLoading)).toEqual(['1']);
  });

  test('다시 읽기 요청은 오류만 지우고, 오류가 아니면 같은 상태를 돌려준다', () => {
    const failed = run(MEMBER, {type: 'firstPageFailed'});
    expect(run(failed, {type: 'refreshRequested'}).status).toBe('success');
    expect(historyListReducer(LOADED, {type: 'refreshRequested'})).toBe(LOADED);
  });

  test('다시 읽기 실패는 목록이 비어 있을 때만 오류로 두고, 첫 페이지 로딩 중에는 무시한다', () => {
    expect(historyListReducer(LOADED, {type: 'refreshFailed'})).toBe(LOADED);
    expect(historyListReducer(MEMBER, {type: 'refreshFailed'})).toBe(MEMBER);

    const empty = run(MEMBER, {type: 'firstPageLoaded', page: page([])});
    expect(run(empty, {type: 'refreshFailed'}).status).toBe('error');
  });
});

describe('historyListReducer: 이전 기록', () => {
  test('요청하면 진행 중으로 두고 오류 화면을 지운다', () => {
    const requested = run(LOADED, {type: 'morePageRequested'});
    expect(requested.more).toEqual({status: 'loading'});
    expect(canLoadMore(requested)).toBe(false);

    const failedFirst = run(MEMBER, {type: 'firstPageFailed'});
    expect(run(failedFirst, {type: 'morePageRequested'}).status).toBe('success');
    expect(run(MEMBER, {type: 'morePageRequested'}).status).toBe('loading');
  });

  test('받으면 이미 가진 항목을 빼고 뒤에 붙이고, 커서를 바꾸고 이어 읽은 표시를 켠다', () => {
    const loaded = run(
      LOADED,
      {type: 'morePageRequested'},
      {type: 'morePageLoaded', page: page([3, 2, 1], SECOND_CURSOR)},
    );
    expect(ids(loaded)).toEqual(['5', '4', '3', '2', '1']);
    expect(loaded.cursor).toBe(SECOND_CURSOR);
    expect(loaded.more).toEqual({status: 'idle'});
    expect(loaded.hasLoadedMore).toBe(true);
    expect(canLoadMore(loaded)).toBe(true);
  });

  test('실패하면 목록과 커서는 두고 실패한 커서와 함께 다시 불러오기를 기다린다', () => {
    const failed = run(
      LOADED,
      {type: 'morePageRequested'},
      {type: 'morePageFailed', cursor: FIRST_CURSOR},
    );
    expect(failed.more).toEqual({status: 'error', cursor: FIRST_CURSOR});
    expect(failed.reels).toBe(LOADED.reels);
    expect(failed.cursor).toBe(FIRST_CURSOR);
    expect(canLoadMore(failed)).toBe(false);
  });

  test('더 보기가 실패한 뒤 다시 읽기가 커서를 비워도 실패한 커서를 남긴다', () => {
    const failed = run(
      LOADED,
      {type: 'morePageRequested'},
      {type: 'morePageFailed', cursor: FIRST_CURSOR},
    );
    // 폴링: 첫 페이지가 더 읽을 페이지가 없다고 답한다.
    const polled = run(failed, {type: 'refreshLoaded', page: page([5, 4, 3], null)});
    expect(polled.cursor).toBeNull();
    expect(polled.more).toEqual({status: 'error', cursor: FIRST_CURSOR});
  });
});

describe('historyListReducer: 비회원과 재시도', () => {
  test('비회원 목록을 받으면 성공으로 두고 커서를 비우고 더 보기 진행 표시를 내린다', () => {
    const guestReels = [reel(10)];
    const loadingMore = run(LOADED, {type: 'morePageRequested'});
    const guest = run(loadingMore, {type: 'guestReelsLoaded', reels: guestReels});
    expect(guest.status).toBe('success');
    expect(guest.reels).toBe(guestReels);
    expect(guest.cursor).toBeNull();
    expect(guest.more).toEqual({status: 'idle'});
  });

  test('재시도로 접수된 공유는 맨 앞에 넣고, 같은 ID가 있으면 그 자리에서 바꾼다', () => {
    const inserted = run(LOADED, {type: 'retryAccepted', reel: reel(8, 'PROCESSING')});
    expect(ids(inserted)).toEqual(['8', '5', '4', '3']);

    const replaced = run(inserted, {type: 'retryAccepted', reel: reel(4, 'PROCESSING')});
    expect(ids(replaced)).toEqual(['8', '5', '4', '3']);
    expect(replaced.reels[2].processing_status).toBe('PROCESSING');
  });
});
