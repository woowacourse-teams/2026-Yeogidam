import type {HistoryCursor, HistoryReel} from '../../entities/content/types';

/** 공유 목록 API가 돌려주는 한 페이지입니다. */
export type HistoryPage = {
  reels: HistoryReel[];
  nextCursor: HistoryCursor | null;
};

/**
 * 이전 기록(더 보기) 상태입니다. error는 실패한 커서를 담아, 폴링이 커서를 바꾼 뒤에도 다시 불러오기가
 * 실패한 페이지를 읽게 합니다.
 */
export type HistoryMoreState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'error'; cursor: HistoryCursor};

const MORE_IDLE: HistoryMoreState = {status: 'idle'};
const MORE_LOADING: HistoryMoreState = {status: 'loading'};

export type HistoryListState = {
  /** 첫 페이지 상태입니다. loading이면 불러오는 중 문구를, error면 오류 화면을 목록 대신 보입니다. */
  status: 'loading' | 'error' | 'success';
  reels: HistoryReel[];
  /** 다음에 읽을 페이지의 커서입니다. null이면 더 읽을 페이지가 없습니다. */
  cursor: HistoryCursor | null;
  /** 이전 기록(더 보기) 상태입니다. error면 스크롤로는 다시 읽지 않고 다시 불러오기 버튼을 기다립니다. */
  more: HistoryMoreState;
  /** 더 보기로 첫 페이지 다음까지 읽었는지입니다. true면 커서는 더 보기만 바꿉니다. */
  hasLoadedMore: boolean;
};

export type HistoryListAction =
  | {type: 'guestReelsLoaded'; reels: HistoryReel[]}
  | {type: 'firstPageRequested'}
  | {type: 'firstPageLoaded'; page: HistoryPage}
  | {type: 'firstPageFailed'}
  | {type: 'refreshRequested'}
  | {type: 'refreshLoaded'; page: HistoryPage}
  | {type: 'refreshFailed'}
  | {type: 'morePageRequested'}
  | {type: 'morePageLoaded'; page: HistoryPage}
  | {type: 'morePageFailed'; cursor: HistoryCursor}
  | {type: 'retryAccepted'; reel: HistoryReel};

/** 회원은 첫 페이지를 읽는 중으로, 비회원은 체험 목록을 다 읽은 상태로 시작합니다. */
export function createHistoryListState(guestReels?: HistoryReel[]): HistoryListState {
  return {
    status: guestReels === undefined ? 'loading' : 'success',
    reels: guestReels ?? [],
    cursor: null,
    more: MORE_IDLE,
    hasLoadedMore: false,
  };
}

/** 바뀐 값이 없으면 같은 상태를 돌려줘, 같은 값을 넣은 useState처럼 다시 그리지 않게 합니다. */
function patch(state: HistoryListState, changes: Partial<HistoryListState>): HistoryListState {
  const keys = Object.keys(changes) as (keyof HistoryListState)[];
  return keys.some(key => !Object.is(state[key], changes[key])) ? {...state, ...changes} : state;
}

/**
 * 히스토리 목록의 페이지 상태를 바꿉니다.
 *
 * first page는 화면을 가리고 처음부터 읽는 흐름이고, refresh는 폴링이나 재시도 접수 뒤처럼 목록을
 * 둔 채 첫 페이지를 다시 읽는 흐름이며, more page는 커서로 이전 기록을 이어 읽는 흐름입니다.
 * refresh는 첫 페이지를 읽는 동안 상태를 로딩에서 바꾸지 않습니다. 로딩 문구가 오류 화면보다 먼저
 * 보이고, 첫 페이지를 다 읽을 때 그 결과로 오류인지 다시 정하기 때문입니다.
 */
export function historyListReducer(
  state: HistoryListState,
  action: HistoryListAction,
): HistoryListState {
  switch (action.type) {
    case 'guestReelsLoaded':
      return patch(state, {
        status: 'success',
        reels: action.reels,
        cursor: null,
        more: state.more.status === 'loading' ? MORE_IDLE : state.more,
      });
    case 'firstPageRequested':
      return patch(state, {
        status: 'loading',
        more: state.more.status === 'error' ? MORE_IDLE : state.more,
        hasLoadedMore: false,
      });
    case 'firstPageLoaded':
      return patch(state, {
        status: 'success',
        reels: action.page.reels,
        cursor: action.page.nextCursor,
      });
    case 'firstPageFailed':
      return patch(state, {status: 'error'});
    case 'refreshRequested':
      return patch(state, {status: state.status === 'error' ? 'success' : state.status});
    case 'refreshLoaded': {
      const refreshedIds = new Set(action.page.reels.map(item => item.id));
      return patch(state, {
        status: state.status === 'loading' ? 'loading' : 'success',
        reels: [
          ...action.page.reels,
          ...state.reels.filter(item => !refreshedIds.has(item.id)),
        ],
        // 더 보기로 이어 읽은 뒤에는 커서가 마지막으로 읽은 페이지를 가리키고, 끝까지 읽어 null이면 그대로 둡니다.
        cursor: state.hasLoadedMore ? state.cursor : action.page.nextCursor,
      });
    }
    case 'refreshFailed':
      // 이미 보이는 목록은 지우지 않고 다음 폴링에 맡깁니다.
      if (state.reels.length > 0 || state.status === 'loading') return state;
      return patch(state, {status: 'error'});
    case 'morePageRequested':
      return patch(state, {
        status: state.status === 'error' ? 'success' : state.status,
        more: MORE_LOADING,
      });
    case 'morePageLoaded': {
      // 폴링으로 첫 페이지 경계가 밀리면 이미 가진 항목이 다음 페이지에 다시 올 수 있습니다.
      const currentIds = new Set(state.reels.map(item => item.id));
      return patch(state, {
        reels: [
          ...state.reels,
          ...action.page.reels.filter(item => !currentIds.has(item.id)),
        ],
        cursor: action.page.nextCursor,
        more: MORE_IDLE,
        hasLoadedMore: true,
      });
    }
    case 'morePageFailed':
      // 같은 커서로 다시 실패하면 같은 상태를 돌려준다.
      if (state.more.status === 'error' && state.more.cursor === action.cursor) return state;
      return patch(state, {more: {status: 'error', cursor: action.cursor}});
    case 'retryAccepted':
      return patch(state, {
        reels: state.reels.some(item => item.id === action.reel.id)
          ? state.reels.map(item => (item.id === action.reel.id ? action.reel : item))
          : [action.reel, ...state.reels],
      });
  }
}

/** 맨 아래까지 스크롤했을 때 이전 기록을 이어 읽을 수 있는지 알려 줍니다. 읽을 수 있으면 커서가 있습니다. */
export function canLoadMore(
  state: HistoryListState,
): state is HistoryListState & {cursor: HistoryCursor} {
  return state.cursor !== null && state.more.status === 'idle';
}
