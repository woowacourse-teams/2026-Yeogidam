import {useEffect, useRef, useState} from 'react';

import {getHistoryReelDetail} from '../../entities/content/history-api';
import type {HistoryReel, HistoryReelDetail} from '../../entities/content/types';

/** 히스토리 상세 읽기 상태입니다. 읽는 중이거나, 상세를 읽었거나, 읽지 못했습니다. */
export type HistoryReelDetailState =
  | {status: 'loading'}
  | {status: 'success'; detail: HistoryReelDetail}
  | {status: 'error'};

const LOADING: HistoryReelDetailState = {status: 'loading'};

/**
 * 히스토리 상세에 보일 공유 정보와 찾은 장소를 읽어 상태 하나로 돌려줍니다.
 * 항목 ID가 바뀔 때만 읽으므로 폴링이 같은 항목을 새 객체로 바꿔도 다시 읽지 않고,
 * 항목 ID가 바뀌거나 상세를 닫은 뒤에 도착한 이전 응답은 버립니다.
 *
 * @param guestDetail 비회원 체험 상세입니다. undefined가 아니면 서버에 묻지 않고 이 값을 쓰며,
 * null이면 찾은 장소가 없는 상세로 봅니다.
 */
export function useHistoryReelDetail(
  reel: HistoryReel,
  guestDetail?: HistoryReelDetail | null,
): HistoryReelDetailState {
  const [memberState, setMemberState] = useState<HistoryReelDetailState>(LOADING);
  // 폴링이 같은 항목을 새 객체로 바꿔도 다시 조회하지 않도록 ID가 바뀔 때만 읽는다.
  const reelRef = useRef(reel);
  reelRef.current = reel;

  useEffect(() => {
    if (guestDetail !== undefined) return;
    let isActive = true;
    setMemberState(LOADING);
    getHistoryReelDetail(reelRef.current).then(
      detail => {
        if (isActive) setMemberState({status: 'success', detail});
      },
      () => {
        if (isActive) setMemberState({status: 'error'});
      },
    );
    return () => {
      isActive = false;
    };
  }, [guestDetail, reel.id]);

  if (guestDetail === undefined) return memberState;
  // 체험 상세가 없으면 서버가 완료되지 않은 공유에 돌려주는 값처럼 장소 없는 상세로 본다.
  return {status: 'success', detail: guestDetail ?? {...reel, extraction: null}};
}
